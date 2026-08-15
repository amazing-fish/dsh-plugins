import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MemoSnapshot, MemoZoneId } from '@deepseek-ai/dsh-host-memo/types'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './MemoFloat.module.css'

export interface MemoActions {
  list: () => Promise<MemoSnapshot>
  add: (zone: MemoZoneId, text: string) => Promise<MemoSnapshot>
  remove: (id: string) => Promise<MemoSnapshot>
}

export type MemoFloatProps = PropsRuntime<'shell.overlay'> & InjectFace<MemoActions>

const ZONES: readonly { id: MemoZoneId; name: string; color: string }[] = [
  { id: 'urgent', name: '重要 · 紧急', color: 'var(--dsw-alias-state-error-primary)' },
  { id: 'important', name: '重要 · 稍后', color: 'var(--dsw-alias-state-warn-primary)' },
  { id: 'ideas', name: '灵感 · 想法', color: 'var(--dsw-alias-state-business-primary)' },
  { id: 'other', name: '日常 · 其他', color: 'var(--dsw-alias-state-success-primary)' },
]

export function MemoFloat({ list, add, remove }: MemoFloatProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [active, setActive] = useState<MemoZoneId>('urgent')
  const [draft, setDraft] = useState('')
  const [snapshot, setSnapshot] = useState<MemoSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const mounted = useRef(true)
  const floatRef = useRef<HTMLElement | null>(null)
  const drag = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null)

  useEffect(() => () => { mounted.current = false }, [])
  useEffect(() => {
    void list().then(
      value => { if (mounted.current) setSnapshot(value) },
      () => { if (mounted.current) setError('读取失败，请稍后重试') },
    )
  }, [list])

  const grouped = useMemo<Record<MemoZoneId, MemoSnapshot['items']>>(() => ({
    urgent: snapshot?.items.filter(item => item.zone === 'urgent') ?? [],
    important: snapshot?.items.filter(item => item.zone === 'important') ?? [],
    ideas: snapshot?.items.filter(item => item.zone === 'ideas') ?? [],
    other: snapshot?.items.filter(item => item.zone === 'other') ?? [],
  }), [snapshot])
  const firstMemo = snapshot?.items[0]

  const clampPosition = useCallback((x: number, y: number) => {
    const element = floatRef.current
    if (element === null) return { x, y }
    const maxX = Math.max(8, window.innerWidth - element.offsetWidth - 8)
    const maxY = Math.max(8, window.innerHeight - element.offsetHeight - 8)
    return { x: Math.min(Math.max(8, x), maxX), y: Math.min(Math.max(8, y), maxY) }
  }, [])

  const beginDrag = (event: React.PointerEvent<HTMLElement>): void => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button') !== null) return
    const element = floatRef.current
    if (element === null) return
    const rect = element.getBoundingClientRect()
    drag.current = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top }
    event.currentTarget.setPointerCapture(event.pointerId)
    setPosition({ x: rect.left, y: rect.top })
  }

  const moveDrag = (event: React.PointerEvent<HTMLElement>): void => {
    const current = drag.current
    if (current === null || current.pointerId !== event.pointerId) return
    setPosition(clampPosition(event.clientX - current.offsetX, event.clientY - current.offsetY))
  }

  const endDrag = (event: React.PointerEvent<HTMLElement>): void => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  useEffect(() => {
    const onResize = () => { setPosition(current => current === null ? null : clampPosition(current.x, current.y)) }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize) }
  }, [clampPosition])

  const submit = async (): Promise<void> => {
    const value = draft.trim()
    if (value === '' || pending) return
    setPending(true)
    setError(null)
    try {
      const next = await add(active, value)
      if (mounted.current) { setSnapshot(next); setDraft('') }
    } catch {
      if (mounted.current) setError('保存失败，请检查数据目录')
    } finally {
      if (mounted.current) setPending(false)
    }
  }

  const deleteItem = async (id: string): Promise<void> => {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const next = await remove(id)
      if (mounted.current) setSnapshot(next)
    } catch {
      if (mounted.current) setError('删除失败，请稍后重试')
    } finally {
      if (mounted.current) setPending(false)
    }
  }

  return (
    <section
      ref={floatRef}
      className={`${css.float} ${collapsed ? css.collapsed : ''}`}
      style={position === null ? undefined : { left: position.x, top: position.y, right: 'auto' }}
      aria-label="分区备忘浮窗"
    >
      <header
        className={css.header}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className={css.title}>✦ 分区备忘</span>
        {collapsed ? <span className={css.preview} title={firstMemo?.text}>{firstMemo?.text ?? '暂无备忘'}</span> : null}
        <button className={css.button} type="button" onClick={() => { setCollapsed(value => !value) }}>
          {collapsed ? '展开' : '收起'}
        </button>
      </header>
      {!collapsed ? (
        <div className={css.body}>
          <div className={css.grid}>
            {ZONES.map(zone => (
              <div
                key={zone.id}
                className={`${css.zone} ${active === zone.id ? css.active : ''}`}
                style={{ '--memo-zone': zone.color } as React.CSSProperties}
                onClick={() => { setActive(zone.id) }}
              >
                <div className={css.zoneHeader}>
                  <span className={css.zoneName}>{zone.name}</span>
                  <span className={css.count}>{grouped[zone.id].length}</span>
                </div>
                {snapshot === null ? <div className={css.empty}>正在读取…</div> : grouped[zone.id].length === 0
                  ? <div className={css.empty}>{active === zone.id ? '在下方添加备忘…' : '点击选择此分区'}</div>
                  : <div className={css.list}>{grouped[zone.id].map(item => (
                    <div className={css.item} key={item.id}>
                      <span className={css.text}>{item.text}</span>
                      <button
                        className={css.delete}
                        type="button"
                        aria-label={`删除备忘：${item.text}`}
                        disabled={pending}
                        onClick={(event) => { event.stopPropagation(); void deleteItem(item.id) }}
                      >×</button>
                    </div>
                  ))}</div>}
              </div>
            ))}
          </div>
          <div className={css.compose}>
            <input
              className={css.input}
              value={draft}
              maxLength={4000}
              placeholder={`添加到「${ZONES.find(zone => zone.id === active)?.name ?? ''}」`}
              onChange={(event) => { setDraft(event.currentTarget.value) }}
              onKeyDown={(event) => { if (event.key === 'Enter') void submit() }}
            />
            <button className={`${css.button} ${css.add}`} type="button" disabled={pending || draft.trim() === ''} onClick={() => { void submit() }}>
              {pending ? '保存中' : '添加'}
            </button>
          </div>
          {error !== null ? <p className={css.error} role="alert">{error}</p> : null}
          <p className={css.path}>数据保存在 D:\Data\dsh\memo</p>
        </div>
      ) : null}
    </section>
  )
}
