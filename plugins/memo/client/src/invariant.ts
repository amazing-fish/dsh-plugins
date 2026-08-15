/** Package-owned invariant companion. @module @deepseek-ai/dsh-client-ui-memo/invariant */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-memo'
export const name = 'client-ui-memo-invariant'
export const inject = ['invariants']
/** No runtime invariant: the plugin owns one lifecycle-bound additive Slot registration. */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
