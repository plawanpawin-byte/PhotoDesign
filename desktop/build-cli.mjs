// Builds the MCP server and command-line tool (apps/photocraft-cli, the engine natively) into
// desktop/bin/photodesign-cli, where the app and the installer look for it. Run: npm run cli
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = dirname(fileURLToPath(import.meta.url));
const root = join(desktop, '..');
execFileSync('cargo', ['build', '-p', 'photocraft-cli', '--release'], { cwd: root, stdio: 'inherit' });
const targetDir = JSON.parse(execFileSync('cargo', ['metadata', '--format-version', '1', '--no-deps'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 })).target_directory;
const exe = process.platform === 'win32' ? '.exe' : '';
mkdirSync(join(desktop, 'bin'), { recursive: true });
const built = join(targetDir, 'release', `photocraft-cli${exe}`);
const dest = join(desktop, 'bin', `photodesign-cli${exe}`);
try {
  copyFileSync(built, dest);
} catch (e) {
  if (!['EBUSY', 'EPERM', 'EACCES', 'ETXTBSY'].includes(e.code)) throw e;
  // An agent (Codex, Claude Code, Antigravity) or the app is running the old copy. A running exe cannot be
  // overwritten but it can be renamed, so move it aside and put the new one in its place.
  try {
    rmSync(`${dest}.old`, { force: true });
    renameSync(dest, `${dest}.old`);
    copyFileSync(built, dest);
  } catch (again) {
    console.error(`Could not replace ${dest} (${again.code ?? again.message}).\nClose PhotoDesign and any agent app that uses it (Codex, Claude Code, Antigravity), then run this again.`);
    process.exit(1);
  }
  console.log('The old MCP server is still running in an open agent app: restart that app to use the new one.');
}
console.log(`MCP server ready: desktop/bin/photodesign-cli${exe}`);
