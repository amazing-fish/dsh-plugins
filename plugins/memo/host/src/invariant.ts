/** Package-owned invariant companion. @module @deepseek-ai/dsh-host-memo/invariant */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-host-memo'
export const name = 'host-memo-invariant'
export const inject = ['invariants']
/** No runtime invariant: persistence and Remote behavior are covered by focused service tests. */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
