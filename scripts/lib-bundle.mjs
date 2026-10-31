// Concatenates the shared logic in src/lib so the exact same code runs in
// n8n Code nodes (inlined at build time) and in the unit tests.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const LIB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib');
export const LIB_ORDER = ['extract.cjs', 'match.cjs', 'notion.cjs', 'pipeline.cjs', 'decide.cjs', 'summary.cjs', 'notify.cjs'];

export function libSource(files = LIB_ORDER) {
  return files.map((f) => `// ---- src/lib/${f} ----\n` + readFileSync(join(LIB_DIR, f), 'utf8')).join('\n');
}

// Evaluate the bundle and return every function the files export.
export function loadLib() {
  const acc = {};
  const mod = {};
  Object.defineProperty(mod, 'exports', { get: () => acc, set: (v) => Object.assign(acc, v) });
  new Function('module', libSource())(mod);
  return acc;
}
