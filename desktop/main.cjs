// PhotoDesign's desktop window: serves the TypeScript interface (web/dist, with the Rust engine
// as WebAssembly) on 127.0.0.1 and shows it. Nothing is reachable from other computers.
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { startControl, loadToken, tokenFile } = require('./control.cjs');

// `PhotoDesign.exe --install-mcp` connects the AI agents installed on this computer, then exits.
const INSTALL_MODE = process.argv.includes('--install-mcp');

// Installed builds carry the interface in resources/web; from source it is web/dist.
const dist = path.resolve(process.env.PHOTODESIGN_WEB_DIST || (app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', 'web', 'dist')));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff2': 'font/woff2',
};

// WebGPU where the build has it; wgpu falls back to WebGL2 otherwise.
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan');

function serve() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
      const file = path.resolve(dist, rel);
      if (file !== dist && !file.startsWith(dist + path.sep)) {
        res.writeHead(403).end('forbidden');
        return;
      }
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404).end('not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// AI agents (MCP) reach the window through the control channel; PHOTODESIGN_CONTROL=0 turns it off.
function startAgents(win) {
  if (process.env.PHOTODESIGN_CONTROL === '0') return;
  const pending = new Map();
  let seq = 0;
  // Resolves once the page's handler is attached (the engine loads first, which takes a moment).
  let markReady;
  const ready = new Promise((resolve) => (markReady = resolve));
  ipcMain.on('control:ready', (e) => {
    if (e.sender !== win.webContents) return;
    markReady();
    // A reloaded page announces itself again; what the old page was asked is lost with it.
    for (const p of pending.values()) p.reject(new Error('the PhotoDesign window reloaded; try again'));
    pending.clear();
  });
  ipcMain.on('control:reply', (e, { id, ok, result, error }) => {
    const p = pending.get(id);
    if (!p || e.sender !== win.webContents) return;
    pending.delete(id);
    if (ok) p.resolve(result);
    else p.reject(new Error(error));
  });
  const call = async (method, params) => {
    let timer;
    const starting = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('PhotoDesign is still starting; try again in a moment')), 30_000);
    });
    await Promise.race([ready, starting]).finally(() => clearTimeout(timer));
    if (win.isDestroyed()) throw new Error('the PhotoDesign window is closed');
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      win.webContents.send('control:call', { id, method, params });
    });
  };
  const root = path.resolve(process.env.PHOTODESIGN_AUTOMATION_ROOT || path.join(app.getPath('documents'), 'PhotoDesign'));
  const cli = cliPath();
  const started = startControl({ port: Number(process.env.PHOTODESIGN_CONTROL_PORT || 7878), root, window: () => (win.isDestroyed() ? null : win), call });
  started.then(
    (c) => console.log(`PhotoDesign control: 127.0.0.1:${c.port}, token file ${c.tokenFile}, files in ${c.root}`),
    (e) => console.error(`PhotoDesign control channel not started: ${e.message}`),
  );
  ipcMain.handle('control:info', async () => {
    const c = await started;
    return { port: c.port, tokenFile: c.tokenFile, root: c.root, cli, cliFound: fs.existsSync(cli) };
  });
}

function cliPath() {
  const exe = process.platform === 'win32' ? 'photodesign-cli.exe' : 'photodesign-cli';
  return app.isPackaged ? path.join(process.resourcesPath, 'bin', exe) : path.join(__dirname, 'bin', exe);
}

async function runInstallMcp() {
  const { installMcp } = require('./install-mcp.cjs');
  const log = (text) => {
    process.stdout.write(text);
    fs.promises.writeFile(path.join(app.getPath('userData'), 'install-mcp.log'), text, 'utf8').catch(() => {});
  };
  // the portable build runs from a temporary copy, so an agent config pointing into it would break on the next start
  if (process.env.PORTABLE_EXECUTABLE_FILE) {
    log('PhotoDesign: the portable build cannot be connected to agents. Install with PhotoDesign-Setup and run this again.\n');
    app.exit(1);
    return;
  }
  const cli = cliPath();
  if (!fs.existsSync(cli)) {
    log(`PhotoDesign: the MCP server was not found at ${cli}. From source, run npm run cli in the desktop folder first.\n`);
    app.exit(1);
    return;
  }
  loadToken();
  const port = Number(process.env.PHOTODESIGN_CONTROL_PORT || 7878);
  const entry = { command: cli, args: ['mcp', '--bridge', `127.0.0.1:${port}`, '--control-token-file', tokenFile] };
  const report = await installMcp({ home: app.getPath('home'), entry });
  const lines = [
    'PhotoDesign: connecting AI agents',
    ...report.map((r) => (r.status === 'written' ? `  ${r.agent}: written to ${r.file}` : r.status === 'skipped' ? `  ${r.agent}: skipped (${r.reason})` : `  ${r.agent}: NOT written (${r.reason}) ${r.file}`)),
    'Restart Claude Code, Codex or Antigravity, open PhotoDesign, then ask the agent to use the photodesign tools.',
  ];
  log(lines.join('\n') + '\n');
  app.exit(report.some((r) => r.status === 'failed') ? 1 : 0);
}

app.whenReady().then(async () => {
  if (INSTALL_MODE) return runInstallMcp();
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    const win = new BrowserWindow({ width: 760, height: 260, backgroundColor: '#222222' });
    win.removeMenu();
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
      `<body style="font:14px system-ui;background:#222;color:#fff;padding:24px">` +
      `<b>No web build found</b><p>Looked in <code>${dist.replace(/</g, '&lt;')}</code>.</p>` +
      `<p>Build it first: <code>cd web &amp;&amp; npm install &amp;&amp; npm run engine &amp;&amp; npm run build</code></p></body>`));
    return;
  }
  const server = await serve();
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#222222',
    title: 'PhotoDesign',
    autoHideMenuBar: true,
    icon: path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
  });
  startAgents(win);
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadURL(`http://127.0.0.1:${server.address().port}/`);
  app.on('window-all-closed', () => server.close(() => app.quit()));
});
