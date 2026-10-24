// One command to open PhotoDesign: brings the Rust engine and the interface up to date with the
// source, then starts the Electron window. Run it with `npm start` in this folder. Both builds are
// incremental, so after the first run they take seconds.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = dirname(fileURLToPath(import.meta.url));
const web = join(desktop, '..', 'web');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });

if (!existsSync(join(web, 'node_modules'))) run(npm, ['install'], web);
// Always rebuild: a stale engine or interface is what you'd see otherwise after a `git pull`.
run(npm, ['run', 'engine', '--', '--fast'], web);
run(npm, ['run', 'build'], web);
run(npm, ['exec', '--', 'electron', '.'], desktop);
