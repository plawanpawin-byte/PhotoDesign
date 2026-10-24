// PhotoDesign's desktop window: serves the TypeScript interface (web/dist, with the Rust engine
// as WebAssembly) on 127.0.0.1 and shows it. Nothing is reachable from other computers.
const { app, BrowserWindow, shell } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');

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

app.whenReady().then(async () => {
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
  const win = new BrowserWindow({ width: 1440, height: 900, backgroundColor: '#222222', title: 'PhotoDesign', autoHideMenuBar: true, icon: path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png') });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadURL(`http://127.0.0.1:${server.address().port}/`);
  app.on('window-all-closed', () => server.close(() => app.quit()));
});
