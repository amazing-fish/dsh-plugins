import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
assert.equal(args.length, 4, 'usage: node stage-package.mjs --source PACKAGE --stage NEW_TEMP_DIRECTORY')
assert.equal(args[0], '--source'); assert.equal(args[2], '--stage')
const source = await realpath(path.resolve(args[1]))
const stage = path.resolve(args[3])
const normalized = stage.replaceAll('\\', '/').toLowerCase()
assert.ok(process.platform === 'win32' ? /^c:\/temp\/.+/.test(normalized) : normalized.startsWith('/workspace/scratch/') || normalized.startsWith('/tmp/'), 'stage must be a new temporary directory')
assert.ok(!normalized.includes('/.dsh/') && !normalized.endsWith('/.dsh'), 'stage cannot be a DSH home')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'))
const replacements = Object.keys(manifest.replacement)
for (const file of replacements) {
  assert.equal(hash(await readFile(path.join(root, 'replacement', file))), manifest.replacement[file], `replacement hash mismatch: ${file}`)
}
async function existing(p) { try { return await lstat(p) } catch (err) { if (err.code === 'ENOENT') return null; throw err } }
async function verifyStage() {
  assert.equal((await existing(stage))?.isSymbolicLink(), false, 'stage cannot be a symlink or junction')
  assert.equal(JSON.parse(await readFile(path.join(stage, 'LOCAL-BUILD.json'), 'utf8')).id, manifest.id)
  for (const file of replacements) assert.equal(hash(await readFile(path.join(stage, file))), manifest.replacement[file], `staged hash mismatch: ${file}`)
  for (const file of ['lib/index.js', 'lib/client.js']) execFileSync(process.execPath, ['--check', path.join(stage, file)], { stdio: 'pipe' })
}
if (await existing(stage)) {
  await verifyStage()
  console.log(`Already staged and verified: ${stage}`)
  process.exit(0)
}
// Resolve an existing parent before creating anything; a junction must not redirect writes into a live home.
let parent = path.dirname(stage)
while (!(await existing(parent))) parent = path.dirname(parent)
const actualParent = (await realpath(parent)).replaceAll('\\', '/').toLowerCase()
assert.ok(process.platform === 'win32' ? /^c:\/temp(?:\/|$)/.test(actualParent) : actualParent.startsWith('/workspace/scratch/') || actualParent === '/tmp' || actualParent.startsWith('/tmp/'))
const pkg = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'))
assert.equal(pkg.name, 'dsh-context'); assert.equal(pkg.version, '0.73.3')
let host = await readFile(path.join(source, 'lib/index.js'), 'utf8')
let input = 'pristine'
if (hash(host) !== manifest.pristine['lib/index.js']) {
  input = 'B12'
  const bump = /return\{headers:i\.length>50\?i\.slice\(-50\):i\}\},stateVersion:2(?:\s*\/\*[^*]*local patch[^*]*\*\/)?/g
  const matches = [...host.matchAll(bump)]
  assert.equal(matches.length, 1, 'unknown host: expected exactly one audited B12 version anchor')
  host = host.replace(bump, 'return{headers:i.length>50?i.slice(-50):i}},stateVersion:1')
  const mount = 'e.sessionProjections.register(Yt()),Cr(e,t)}'
  assert.equal(host.split(mount).length - 1, 1, 'unknown host: expected exactly one audited removed-backfill anchor')
  host = host.replace(mount, 'e.sessionProjections.register(Yt()),Hn(e,n),Cr(e,t)}')
  assert.equal(hash(host), manifest.pristine['lib/index.js'], 'host includes unreviewed changes; inspect and rebase them first')
}
assert.equal(hash(await readFile(path.join(source, 'lib/client.js'))), manifest.pristine['lib/client.js'], 'client contains unreviewed changes')
const distributable = ['package.json', 'README.md', 'LICENSE', 'icon.svg', 'cordis.patch.yml', 'locale', 'lib']
async function rejectLinks(target) {
  const stat = await lstat(target)
  assert.ok(!stat.isSymbolicLink(), `package entry is a symlink: ${target}`)
  if (stat.isDirectory()) {
    const { readdir } = await import('node:fs/promises')
    for (const name of await readdir(target)) await rejectLinks(path.join(target, name))
  }
}
for (const entry of distributable) await rejectLinks(path.join(source, entry))
await mkdir(stage, { recursive: true })
for (const entry of distributable) await cp(path.join(source, entry), path.join(stage, entry), { recursive: true, dereference: false, errorOnExist: true, force: false })
for (const file of replacements) await cp(path.join(root, 'replacement', file), path.join(stage, file), { force: true })
await writeFile(path.join(stage, 'LOCAL-BUILD.json'), JSON.stringify({ id: manifest.id, input, source, sourceBase: manifest.sourceBase }, null, 2))
await verifyStage()
console.log(`Staged and verified ${input} replacement: ${stage}. Production is unchanged; no process was restarted.`)
