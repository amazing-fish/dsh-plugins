// Host entry — a no-op Cordis plugin. The real logic lives in the client
// entry (./client.js, loaded via <script src> in the browser). DSH's Node
// cordis loader imports exports["."] with import(), so this file must be ESM
// and must NOT reference browser globals (window/__ModuleLoader__) — those
// only exist in the browser half.
const inject = [];
function apply(_ctx) {}
export { apply, inject };
