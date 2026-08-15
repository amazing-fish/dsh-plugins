/** Persistent memo floating window registered into the shell overlay. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { MemoFloat } from './MemoFloat.tsx'
import type { MemoActions } from './MemoFloat.tsx'

export const inject = ['slots', 'remote', 'remote.memo']

export function apply(ctx: ClientContext): void {
  const actions: MemoActions = {
    list: async () => {
      const result = await ctx.remote.memo.list()
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    add: async (zone, text) => {
      const result = await ctx.remote.memo.add(zone, text)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    remove: async (id) => {
      const result = await ctx.remote.memo.delete(id)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
  }
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'memo', order: 20, inject: (): MemoActions => actions,
  }, MemoFloat))
}
