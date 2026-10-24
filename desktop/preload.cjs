// Gives the page the host's control channel and where agents reach it. Requests arrive from the main
// process (control.cjs) and the page's handler (web/src/control.ts) answers them.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('photodesignHost', {
  /** Where agents connect: {port, tokenFile, root, cli, cliFound}. */
  info: () => ipcRenderer.invoke('control:info'),
  onControl(handler) {
    ipcRenderer.on('control:call', async (_event, { id, method, params }) => {
      try {
        ipcRenderer.send('control:reply', { id, ok: true, result: await handler({ method, params }) });
      } catch (e) {
        ipcRenderer.send('control:reply', { id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    });
    ipcRenderer.send('control:ready');
  },
});
