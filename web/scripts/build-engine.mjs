// Builds the Rust engine bridge (apps/photodesign-wasm) for WebAssembly and generates its
// JavaScript bindings into src/engine/pkg. Needs the wasm32-unknown-unknown target and the
// wasm-bindgen CLI at the version in Cargo.lock (or WASM_BINDGEN=<path to it>).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(web, '..');
const profile = process.argv.includes('--dev') ? 'dev' : 'release';
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });

run('cargo', ['build', '-p', 'photodesign-wasm', '--target', 'wasm32-unknown-unknown', '--profile', profile]);

const lock = readFileSync(join(root, 'Cargo.lock'), 'utf8');
const version = /name = "wasm-bindgen"\nversion = "([^"]+)"/.exec(lock)?.[1];
const bindgen = process.env.WASM_BINDGEN || 'wasm-bindgen';
try {
  execFileSync(bindgen, ['--version'], { stdio: 'ignore' });
} catch {
  console.error(`wasm-bindgen not found. Install it with: cargo install wasm-bindgen-cli --version ${version ?? '<see Cargo.lock>'}`);
  process.exit(1);
}
const wasm = join(root, 'target', 'wasm32-unknown-unknown', profile === 'dev' ? 'debug' : 'release', 'photodesign_wasm.wasm');
if (!existsSync(wasm)) {
  console.error(`missing ${wasm}`);
  process.exit(1);
}
run(bindgen, ['--target', 'web', '--out-dir', join(web, 'src', 'engine', 'pkg'), wasm]);
console.log('engine ready: web/src/engine/pkg');
