/** Durable four-zone memo service backed by a JSON document. */
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import s from '@deepseek-ai/schemastery'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import type { MemoItem, MemoSnapshot, MemoZoneId } from './types.ts'

export type * from './types.ts'

export interface Config {
  /** Absolute directory containing memo.json. */
  readonly root: string
}

declare module '@deepseek-ai/cordis' {
  interface Context { memo: MemoService }
}

const zoneSchema = z.union([
  z.literal('urgent'), z.literal('important'), z.literal('ideas'), z.literal('other'),
])
const itemSchema = z.object({
  id: z.string().min(1),
  zone: zoneSchema,
  text: z.string().min(1).max(4000),
  createdAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
})
const documentSchema = z.object({
  version: z.literal(1),
  items: z.array(itemSchema).max(2000),
})
const EMPTY: MemoSnapshot = Object.freeze({ version: 1, items: Object.freeze([]) })

function snapshot(document: MemoSnapshot): MemoSnapshot {
  return Object.freeze({
    version: 1,
    items: Object.freeze(document.items.map(item => Object.freeze({ ...item }))),
  })
}

function zone(value: string): MemoZoneId {
  const parsed = zoneSchema.safeParse(value)
  if (!parsed.success) throw new TypeError(`memo: unknown zone '${value}'`)
  return parsed.data
}

function text(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) throw new TypeError('memo: text must not be blank')
  if (trimmed.length > 4000) throw new TypeError('memo: text exceeds 4000 characters')
  return trimmed
}

/** Host-owned durable memo Remote. */
export class MemoService extends TypertRemoteService {
  static Config: s<Config> = s.object({ root: s.string().required() })

  private readonly filename: string
  private state: MemoSnapshot = EMPTY
  private ready: Promise<void>
  private tail: Promise<void> = Promise.resolve()

  constructor(ctx: Context, config: Config) {
    super(ctx, 'memo')
    if (config.root.trim().length === 0) throw new TypeError('memo: root must not be blank')
    this.filename = join(config.root, 'memo.json')
    this.ready = this.load()
  }

  /** Read the complete current memo document. */
  @Remote('list')
  async list(): Promise<MemoSnapshot> {
    await this.ready
    await this.tail
    return snapshot(this.state)
  }

  /** Append one memo item to a zone. */
  @Remote('add')
  add(zoneId: string, value: string): Promise<MemoSnapshot> {
    const resolvedZone = zone(zoneId)
    const resolvedText = text(value)
    return this.mutate(items => items.concat({
      id: randomUUID(), zone: resolvedZone, text: resolvedText, createdAt: Date.now(),
    }))
  }

  /** Delete an item by id. Absence is an idempotent success. */
  @Remote('delete')
  delete(id: string): Promise<MemoSnapshot> {
    if (id.length === 0) throw new TypeError('memo: id must not be empty')
    return this.mutate(items => items.filter(item => item.id !== id))
  }

  private async load(): Promise<void> {
    try {
      const raw = await readFile(this.filename, 'utf8')
      this.state = snapshot(documentSchema.parse(JSON.parse(raw)))
    } catch (error) {
      if ((error as NodeJS.ErrnoException | null)?.code !== 'ENOENT') throw error
      await this.persist(EMPTY)
      this.state = EMPTY
    }
  }

  private mutate(change: (items: readonly MemoItem[]) => readonly MemoItem[]): Promise<MemoSnapshot> {
    const operation = this.tail.then(async () => {
      await this.ready
      const next = snapshot({ version: 1, items: change(this.state.items) })
      await this.persist(next)
      this.state = next
      return snapshot(next)
    })
    this.tail = operation.then(() => undefined, () => undefined)
    return operation
  }

  private persist(document: MemoSnapshot): Promise<void> {
    return writeFileAtomic(this.filename, `${JSON.stringify(document, null, 2)}\n`, {
      mode: 0o600,
      dirMode: 0o700,
    })
  }
}

export default MemoService
