// Builds the installable app: the Rust engine (full release optimisation), the interface, then
// the installer for this platform into desktop/release. On Windows that is PhotoDesign-Setup-*.exe
// and PhotoDesign-Portable-*.exe. Run it with `npm run dist` in this folder.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = dirname(fileURLToPath(import.meta.url));
const web = join(desktop, '..', 'web');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });

if (!existsSync(join(web, 'node_modules'))) run(npm, ['install'], web);
if (!existsSync(join(desktop, 'node_modules', 'electron-builder'))) run(npm, ['install'], desktop);
run(npm, ['run', 'engine'], web);
run(npm, ['run', 'build'], web);
run(npm, ['exec', '--', 'electron-builder', ...process.argv.slice(2)], desktop);
