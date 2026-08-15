// @vitest-environment jsdom
import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '../src/client/index.ts'
import { MemoFloat } from '../src/client/MemoFloat.tsx'

class RemoteService extends Service {
  constructor(ctx: Context) { super(ctx, 'remote') }
}

describe('ui-memo browser plugin', () => {
  it('registers and disposes one shell.overlay entry', async () => {
    const ctx = new Context()
    new RemoteService(ctx)
    ctx.provide('remote.memo', {
      list: () => Promise.resolve({ ok: true, value: { version: 1, items: [] } }),
      add: () => Promise.resolve({ ok: true, value: { version: 1, items: [] } }),
      delete: () => Promise.resolve({ ok: true, value: { version: 1, items: [] } }),
    })
    await ctx.plugin(SlotRegistry).await()
    ctx.slots.register({ name: 'root', children: { 'shell.overlay': { kind: 'list', scope: 'root' } } } as never, (() => null) as never)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(ctx.slots.entries('shell.overlay')[0]?.options).toMatchObject({ id: 'memo', order: 20 })
    await fiber.dispose()
    expect(ctx.slots.entries('shell.overlay')).toHaveLength(0)
    await ctx.fiber.dispose()
  })

  it('shows the first memo when collapsed and supports header dragging', async () => {
    const list = vi.fn(() => Promise.resolve({
      version: 1 as const,
      items: [{ id: 'm1', zone: 'ideas' as const, text: '第一条备忘', createdAt: 1 }],
    }))
    const view = render(<MemoFloat list={list} add={vi.fn()} remove={vi.fn()} />)
    await waitFor(() => { expect(list).toHaveBeenCalledOnce() })
    fireEvent.click(screen.getByRole('button', { name: '收起' }))
    expect(screen.getByText('第一条备忘')).toBeTruthy()

    const section = view.container.querySelector('section')!
    const header = view.container.querySelector('header')!
    Object.defineProperty(section, 'offsetWidth', { configurable: true, value: 420 })
    Object.defineProperty(section, 'offsetHeight', { configurable: true, value: 60 })
    section.getBoundingClientRect = () => ({ left: 600, top: 18, width: 420, height: 60, right: 1020, bottom: 78, x: 600, y: 18, toJSON: () => ({}) })
    header.setPointerCapture = vi.fn()
    header.hasPointerCapture = vi.fn(() => true)
    header.releasePointerCapture = vi.fn()
    fireEvent.pointerDown(header, { pointerId: 1, button: 0, clientX: 620, clientY: 30 })
    fireEvent.pointerMove(header, { pointerId: 1, clientX: 320, clientY: 230 })
    expect(section.style.left).toBe('300px')
    expect(section.style.top).toBe('218px')
  })
})
