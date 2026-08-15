import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import MemoService from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => { await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) })

async function service(root: string): Promise<MemoService> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(MemoService, { root }).await()
  return ctx.memo
}

describe('MemoService', () => {
  it('creates an empty document and publishes the Remote contract', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memo-'))
    const memo = await service(root)
    expect(remoteMethods(memo).map(method => method.method)).toEqual(['list', 'add', 'delete'])
    expect(await memo.list()).toEqual({ version: 1, items: [] })
    expect(JSON.parse(await readFile(join(root, 'memo.json'), 'utf8'))).toEqual({ version: 1, items: [] })
  })

  it('persists add and remove across service restarts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memo-'))
    const first = await service(root)
    const added = await first.add('ideas', '  一个想法  ')
    expect(added.items).toMatchObject([{ zone: 'ideas', text: '一个想法' }])
    await contexts.shift()!.fiber.dispose()

    const second = await service(root)
    const restored = await second.list()
    expect(restored.items).toHaveLength(1)
    expect((await second.delete(restored.items[0]!.id)).items).toEqual([])
  })

  it('rejects blank text and unknown zones without changing disk', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memo-'))
    const memo = await service(root)
    expect(() => memo.add('unknown', 'x')).toThrow('unknown zone')
    expect(() => memo.add('other', '   ')).toThrow('must not be blank')
    expect((await memo.list()).items).toEqual([])
  })
})
