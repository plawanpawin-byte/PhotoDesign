// The control channel (docs/control-protocol.md) for AI agents: a loopback TCP server speaking
// JSON lines, authenticated by a 64-hex token kept in a user-only file. The MCP server
// (`photodesign-cli mcp --bridge`, crates/automation) connects here; requests run in the window
// (web/src/control.ts), file paths stay inside the automation folder.
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const MAX_REQUEST_BYTES = 1 << 20;
const MAX_CONNECTIONS = 16;
const AUTH_DEADLINE_MS = 10_000;
const IDLE_MS = 30_000;
const REPLY_DEADLINE_MS = 60_000;

const home = path.join(os.homedir(), '.photodesign');
const tokenFile = process.env.PHOTODESIGN_CONTROL_TOKEN_FILE || path.join(home, 'control.token');

/** The token in the token file, creating the file (owner-only) on first use. */
function loadToken() {
  try {
    const t = fs.readFileSync(tokenFile, 'utf8').trim().toLowerCase();
    if (/^[0-9a-f]{64}$/.test(t)) return t;
  } catch {
    // no token yet
  }
  const t = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(tokenFile), { recursive: true, mode: 0o700 });
  fs.writeFileSync(tokenFile, t + '\n', { mode: 0o600 });
  return t;
}

/** `rel` inside `root`, refusing absolute paths and anything that climbs out. */
function inside(root, rel, method) {
  if (typeof rel !== 'string' || !rel) throw new Error(`${method}: \`path\` is required (relative to ${root})`);
  if (path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) throw new Error(`${method}: use a path relative to the automation folder ${root}`);
  const full = path.resolve(root, rel);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error(`${method}: \`${rel}\` is outside the automation folder ${root}`);
  return full;
}

/**
 * Starts the control server. `window()` returns the BrowserWindow, `call(method, params)` runs a
 * request in it. Returns {port, tokenFile, root, close}.
 */
function startControl({ port, root, window, call }) {
  const token = loadToken();
  fs.mkdirSync(root, { recursive: true });
  const expected = Buffer.from(token);
  let connections = 0;

  // Requests that need the host (files, the window itself) are handled here; the rest go to the page.
  async function dispatch(method, params) {
    switch (method) {
      case 'ui.focus': {
        const w = window();
        if (w) {
          if (w.isMinimized()) w.restore();
          w.show();
          w.focus();
        }
        return { focused: !!w };
      }
      case 'ui.screenshot': {
        const w = window();
        if (!w) throw new Error('ui.screenshot: no window');
        if (params.focus !== false) w.show();
        const png = (await w.webContents.capturePage()).toPNG();
        if (params.path) {
          const out = inside(root, params.path, 'ui.screenshot');
          fs.mkdirSync(path.dirname(out), { recursive: true });
          fs.writeFileSync(out, png);
          return { path: out, bytes: png.length };
        }
        return { base64: png.toString('base64'), width: w.getContentSize()[0], height: w.getContentSize()[1] };
      }
      case 'app.open': {
        const file = inside(root, params.path, 'app.open');
        const bytes = fs.readFileSync(file);
        const result = await call('app.openBytes', { name: path.basename(file), base64: bytes.toString('base64') });
        return { ...(result && typeof result === 'object' ? result : {}), path: file, name: path.basename(file), warnings: [] };
      }
      case 'app.save': {
        const file = inside(root, params.path, 'app.save');
        const format = path.extname(file).slice(1).toLowerCase() || 'png';
        const { base64 } = await call('app.exportBytes', { format, quality: params.quality });
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.from(base64, 'base64'));
        return { path: file, warnings: [] };
      }
      default:
        return call(method, params);
    }
  }

  function withDeadline(promise) {
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout: no reply in 60s; the command may still be running')), REPLY_DEADLINE_MS);
    });
    return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
  }

  const server = net.createServer((socket) => {
    if (connections >= MAX_CONNECTIONS) {
      socket.end(JSON.stringify({ id: null, ok: false, error: 'too many control connections' }) + '\n');
      return;
    }
    connections++;
    let authed = false;
    let buf = '';
    let queue = Promise.resolve();
    const send = (msg) => socket.writable && socket.write(JSON.stringify(msg) + '\n');
    const authTimer = setTimeout(() => !authed && socket.destroy(), AUTH_DEADLINE_MS);
    socket.setEncoding('utf8');
    socket.setTimeout(IDLE_MS, () => socket.destroy());
    socket.on('close', () => {
      connections--;
      clearTimeout(authTimer);
    });
    socket.on('error', () => {});

    const handle = (line) => {
      let req;
      try {
        req = JSON.parse(line);
      } catch {
        send({ id: null, ok: false, error: 'request is not valid JSON' });
        return;
      }
      const id = req.id ?? null;
      const params = req.params ?? {};
      if (!authed) {
        const given = Buffer.from(String(params.token ?? '').toLowerCase());
        if (req.method === 'auth' && given.length === expected.length && crypto.timingSafeEqual(given, expected)) {
          authed = true;
          clearTimeout(authTimer);
          send({ id, ok: true, result: { app: 'PhotoDesign' } });
        } else {
          send({ id, ok: false, error: 'authentication failed' });
          socket.end();
        }
        return;
      }
      if (req.method === 'auth') {
        send({ id, ok: false, error: 'already authenticated' });
        return;
      }
      if (typeof params !== 'object' || Array.isArray(params)) {
        send({ id, ok: false, error: `${req.method}: params must be a JSON object` });
        return;
      }
      // One request at a time per connection, replies in order.
      queue = queue.then(() =>
        withDeadline(dispatch(String(req.method), params)).then(
          (result) => send({ id, ok: true, result: result ?? null }),
          (e) => send({ id, ok: false, error: e instanceof Error ? e.message : String(e) }),
        ),
      );
    };

    socket.on('data', (chunk) => {
      buf += chunk;
      if (buf.length > MAX_REQUEST_BYTES && !buf.includes('\n')) {
        send({ id: null, ok: false, error: `request exceeds ${MAX_REQUEST_BYTES} bytes` });
        socket.destroy();
        return;
      }
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) handle(line);
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve({ port: server.address().port, tokenFile, root, close: () => server.close() });
    });
  });
}

module.exports = { startControl, inside, loadToken, tokenFile };
