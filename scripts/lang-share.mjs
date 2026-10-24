// Language share of the code written for PhotoDesign, as opposed to the PhotoCraft engine
// (crates/) it is built on. Run: node scripts/lang-share.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const AUTHORED = ['web/src', 'web/tests', 'web/scripts', 'desktop', 'apps/photodesign-wasm'];
const SKIP = new Set(['node_modules', 'dist', 'pkg', 'target']);
const LANG = { '.ts': 'TypeScript', '.cjs': 'JavaScript', '.mjs': 'JavaScript', '.rs': 'Rust' };

const totals = {};
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (LANG[extname(name)]) totals[LANG[extname(name)]] = (totals[LANG[extname(name)]] ?? 0) + readFileSync(path).length;
  }
};
for (const d of AUTHORED) walk(d);
const sum = Object.values(totals).reduce((a, b) => a + b, 0);
for (const [lang, bytes] of Object.entries(totals).sort((a, b) => b[1] - a[1]))
  console.log(`${lang.padEnd(11)} ${String(bytes).padStart(8)} B  ${((bytes / sum) * 100).toFixed(1)}%`);
