#!/usr/bin/env node
// B12 0.84.1 is withdrawn. This guard never writes installed files.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const BASELINE = Object.freeze({
  'index.js': '32131496f62f80b084cebce2ce4d45f4222fea061c06360465962a88901d9c3d',
  'client.js': '120a8d30ae6bca61a3c61e682c99d5a0472b2b495d277d644721fd9ce6e6fa88',
});
export function inspect(lib) {
  const files = Object.entries(BASELINE).map(([name, expected]) => {
    try {
      const bytes = fs.readFileSync(path.join(lib, name));
      const actual = createHash('sha256').update(bytes).digest('hex');
      return { name, expected, actual, pristine: actual === expected };
    } catch (error) {
      return { name, expected, pristine: false, error: error.code ?? error.message };
    }
  });
  return { fullDataBaseline: files.every(file => file.pristine), files };
}
export function main(argv = process.argv.slice(2)) {
  let lib = path.join(os.homedir(), '.dsh', 'profiles', 'web', 'node_modules', 'dsh-context', 'lib');
  let check = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--check') check = true;
    else if (argv[i] === '--lib' && argv[i + 1] && !argv[i + 1].startsWith('--')) lib = path.resolve(argv[++i]);
    else {
      console.error('B12_DISABLED: unsupported argument; --revert no longer copies unverified backups. Use --check [--lib PATH].');
      return 1;
    }
  }
  const result = inspect(lib);
  console.log(JSON.stringify({ status: result.fullDataBaseline ? 'FULL_DATA_UNPATCHED' : 'BASELINE_MISMATCH', ...result }));
  if (!result.fullDataBaseline) {
    console.error('B12_DISABLED: not the verified official 0.84.1 host/client pair. Do not apply slim or trust marker-only checks. Restore the official pair through the normal package workflow; inspect local differences first.');
    return 1;
  }
  if (!check) {
    console.error('B12_DISABLED: slimming is withdrawn; complete upstream data is preserved. No files changed. --check validates baseline, NOT slimming or running-host load.');
    return 1;
  }
  return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = main();
