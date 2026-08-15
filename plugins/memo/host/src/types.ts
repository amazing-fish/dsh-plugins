/** Stable identifiers of the four memo zones. */
export type MemoZoneId = 'urgent' | 'important' | 'ideas' | 'other'

/** One durable memo item. */
export interface MemoItem {
  readonly id: string
  readonly zone: MemoZoneId
  readonly text: string
  readonly createdAt: number
}

/** Complete durable memo document returned to the browser. */
export interface MemoSnapshot {
  readonly version: 1
  readonly items: readonly MemoItem[]
}
