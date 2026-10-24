// One command to open PhotoDesign: builds the Rust engine and the interface when they are
// missing, then starts the Electron window. Run it with `npm start` in this folder.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = dirname(fileURLToPath(import.meta.url));
const web = join(desktop, '..', 'web');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });

if (!existsSync(join(web, 'node_modules'))) run(npm, ['install'], web);
if (!existsSync(join(web, 'src', 'engine', 'pkg', 'photodesign_wasm.js'))) run(npm, ['run', 'engine'], web);
if (!existsSync(join(web, 'dist', 'index.html'))) run(npm, ['run', 'build'], web);
run(npm, ['exec', '--', 'electron', '.'], desktop);
