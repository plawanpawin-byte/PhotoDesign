import './styles/tokens.css';
import './styles/app.css';
import { App } from './app';
import { loadEngine } from './engine/client';
import { actionFor, isTyping, nextBrushSize } from './lib/keys';
import { centre, stepZoom, zoomAt } from './lib/viewport';
import { toolByKey } from './tools/tools';
import { canvasView } from './ui/canvas';
import { statusLine, toasts, toolDock, toolOptions, topBar, zoomControl } from './ui/chrome';
import { h } from './ui/dom';
import { inspector } from './ui/inspector';
import { commandPalette, menuPopover, newDocumentDialog, welcome } from './ui/overlays';

const ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,.psd,.psb,.pcraft,.exr,.hdr,.tga,.dng,.cr2,.cr3,.nef,.arw,.raf,.orf,.rw2,.heic,.heif,.qoi,.ico';

export function mount(root: HTMLElement, app: App) {
  let overlay: HTMLElement | null = null;
  const closeOverlay = () => {
    overlay?.remove();
    overlay = null;
  };
  const show = (el: HTMLElement) => {
    closeOverlay();
    overlay = el;
    root.append(el);
  };
  const picker = h('input', { type: 'file', accept: ACCEPT, multiple: true, hidden: true }) as HTMLInputElement;
  picker.addEventListener('change', () => {
    if (picker.files?.length) void app.openFiles([...picker.files]);
    picker.value = '';
  });
  const actions = {
    openPicker: () => picker.click(),
    openPalette: () => show(commandPalette(app, closeOverlay)),
    openMenu: (anchor: HTMLElement) => show(menuPopover(app, anchor, closeOverlay)),
    openNew: () => show(newDocumentDialog(app, closeOverlay)),
  };

  const stage = h('main.workspace', canvasView(app), toolOptions(app), zoomControl(app), welcome(app, actions.openPicker, actions.openNew));
  root.append(h('div.shell', topBar(app, actions), h('div.body', toolDock(app), stage, inspector(app)), statusLine(app)), toasts(app), picker);

  const mid = () => ({ x: app.viewport.width / 2, y: app.viewport.height / 2 });
  window.addEventListener('keydown', (e) => {
    if (isTyping(e.target)) return;
    if (overlay) {
      if (e.key === 'Escape') closeOverlay();
      return;
    }
    if ((e.key === ' ' || e.key === 'Alt') && !e.repeat) {
      if (app.tools.hold(e.key, false)) e.preventDefault();
      if (e.key === ' ') e.preventDefault();
      return;
    }
    const action = actionFor(e);
    if (action) {
      e.preventDefault();
      switch (action) {
        case 'undo': return app.undo();
        case 'redo': return app.redo();
        case 'open': return actions.openPicker();
        case 'new': return actions.openNew();
        case 'export': return app.exportAs('png');
        case 'palette': return actions.openPalette();
        case 'zoom-in': return app.setView(zoomAt(app.view, stepZoom(app.view.zoom, 1), mid()));
        case 'zoom-out': return app.setView(zoomAt(app.view, stepZoom(app.view.zoom, -1), mid()));
        case 'zoom-fit': return app.fitView();
        case 'zoom-100': return app.doc && app.setView(centre(app.doc, app.viewport, 1));
        case 'swap-colors': return app.swapColors();
        case 'default-colors': return app.defaultColors();
        case 'brush-smaller': return app.setBrush({ size: nextBrushSize(app.brush.size, -1) });
        case 'brush-larger': return app.setBrush({ size: nextBrushSize(app.brush.size, 1) });
        case 'escape': return;
      }
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const tool = toolByKey(e.key);
      if (tool) {
        e.preventDefault();
        app.tools.select(tool.id);
      }
    }
  });
  window.addEventListener('keyup', (e) => app.tools.release(e.key));
  window.addEventListener('blur', () => app.tools.releaseAll());

  root.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
      root.classList.add('dropping');
    }
  });
  root.addEventListener('dragleave', (e) => {
    if (e.target === root || !root.contains(e.relatedTarget as Node)) root.classList.remove('dropping');
  });
  root.addEventListener('drop', (e) => {
    e.preventDefault();
    root.classList.remove('dropping');
    if (e.dataTransfer?.files.length) void app.openFiles([...e.dataTransfer.files]);
  });
  window.addEventListener('paste', (e) => {
    if (isTyping(e.target)) return;
    const files = [...(e.clipboardData?.files ?? [])];
    if (files.length) void app.openFiles(files.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `Pasted ${i + 1}.png`, { type: f.type }))));
  });
  window.addEventListener('beforeunload', (e) => {
    if (app.state.session.documents.some((d) => d.dirty)) e.preventDefault();
  });
}

async function start() {
  const root = document.getElementById('app');
  if (!root) return;
  try {
    const engine = await loadEngine();
    root.replaceChildren();
    const app = new App(engine);
    mount(root, app);
    (window as unknown as { photodesign: App }).photodesign = app;
  } catch (e) {
    root.replaceChildren(h('div.boot-error', h('h1', 'PhotoDesign could not start'), h('p', e instanceof Error ? e.message : String(e)), h('p', 'Build the engine first: npm run engine')));
  }
}

void start();
