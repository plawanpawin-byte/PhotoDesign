// Builds the MCP server and command-line tool (apps/photocraft-cli, the engine natively) into
// desktop/bin/photodesign-cli, where the app and the installer look for it. Run: npm run cli
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = dirname(fileURLToPath(import.meta.url));
const root = join(desktop, '..');
execFileSync('cargo', ['build', '-p', 'photocraft-cli', '--release'], { cwd: root, stdio: 'inherit' });
const targetDir = JSON.parse(execFileSync('cargo', ['metadata', '--format-version', '1', '--no-deps'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 })).target_directory;
const exe = process.platform === 'win32' ? '.exe' : '';
mkdirSync(join(desktop, 'bin'), { recursive: true });
copyFileSync(join(targetDir, 'release', `photocraft-cli${exe}`), join(desktop, 'bin', `photodesign-cli${exe}`));
console.log(`MCP server ready: desktop/bin/photodesign-cli${exe}`);
