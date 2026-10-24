import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useNative } from '../src/lib/native';

// jsdom has no canvas; the interface tests only need getContext to return nothing.
HTMLCanvasElement.prototype.getContext = (() => null) as never;

// The view maths, command search and colour helpers run in Rust: start the engine for them.
const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'engine', 'pkg');
if (!existsSync(join(pkgDir, 'photodesign_wasm_bg.wasm'))) {
  throw new Error('The Rust engine is not built. Run `npm run engine` in web/ first.');
}
const pkg = await import('../src/engine/pkg/photodesign_wasm.js');
pkg.initSync({ module: readFileSync(join(pkgDir, 'photodesign_wasm_bg.wasm')) });
useNative(pkg);
