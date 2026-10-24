import './styles/tokens.css';
import './styles/app.css';
import { App } from './app';
import { loadEngine } from './engine/client';
import { initLang, onLangChange, t } from './lib/i18n';
import { actionFor, isTyping, nextBrushSize } from './lib/keys';
import { centre, stepZoom, zoomAt } from './lib/viewport';
import { toolByKey } from './tools/tools';
import { canvasView } from './ui/canvas';
import { docTabs, menuBar, statusLine, toasts, toolDock, toolOptions } from './ui/chrome';
import { h } from './ui/dom';
import { panelDock } from './ui/inspector';
import { commandPalette, menuDropdown, newDocumentDialog, welcome } from './ui/overlays';

const ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,.psd,.psb,.pcraft,.exr,.hdr,.tga,.dng,.cr2,.cr3,.nef,.arw,.raf,.orf,.rw2,.heic,.heif,.qoi,.ico';

/** Builds the interface into `root`. Returns a function that removes everything it added. */
export function mount(root: HTMLElement, app: App): () => void {
  const life = new AbortController();
  const on = (target: EventTarget, type: string, fn: (e: any) => void, options?: AddEventListenerOptions) => target.addEventListener(type, fn, { ...options, signal: life.signal });
  let overlay: HTMLElement | null = null;
  const closeOverlay = () => {
    root.querySelectorAll('.menubar-item.open').forEach((b) => b.classList.remove('open'));
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
    openMenu: (name: string, anchor: HTMLElement) => {
      const same = overlay?.querySelector<HTMLElement>('.menu-drop')?.dataset.menu === name;
      if (same) return closeOverlay();
      show(menuDropdown(app, name, anchor, closeOverlay));
      root.querySelectorAll('.menubar-item').forEach((b) => b.classList.toggle('open', b === anchor));
    },
    openNew: () => show(newDocumentDialog(app, closeOverlay)),
  };

  const stage = h('main.workspace', canvasView(app), welcome(app, actions.openPicker, actions.openNew));
  const bar = menuBar(app, actions);
  // While a menu is open, pointing at another menu-bar entry opens that one instead.
  bar.querySelectorAll<HTMLElement>('.menubar-item').forEach((b) =>
    b.addEventListener('mouseenter', () => {
      if (overlay?.querySelector('.menu-drop') && !b.classList.contains('open')) actions.openMenu(b.dataset.menu!, b);
    }));
  root.append(h('div.shell', bar, toolOptions(app), h('div.body', toolDock(app), h('div.center', docTabs(app, actions), stage), panelDock(app)), statusLine(app)), toasts(app), picker);

  const mid = () => ({ x: app.viewport.width / 2, y: app.viewport.height / 2 });
  on(window, 'keydown', (e) => {
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
      const tool = toolByKey(e.key, e.shiftKey, app.tools.selected);
      if (tool) {
        e.preventDefault();
        app.tools.select(tool.id);
      }
    }
  });
  on(window, 'keyup', (e) => app.tools.release(e.key));
  on(window, 'blur', () => app.tools.releaseAll());

  on(root, 'dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
      root.classList.add('dropping');
    }
  });
  on(root, 'dragleave', (e) => {
    if (e.target === root || !root.contains(e.relatedTarget as Node)) root.classList.remove('dropping');
  });
  on(root, 'drop', (e) => {
    e.preventDefault();
    root.classList.remove('dropping');
    if (e.dataTransfer?.files.length) void app.openFiles([...e.dataTransfer.files]);
  });
  on(window, 'paste', (e) => {
    if (isTyping(e.target)) return;
    const files = [...(e.clipboardData?.files ?? [])];
    if (files.length) void app.openFiles(files.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `Pasted ${i + 1}.png`, { type: f.type }))));
  });
  on(window, 'beforeunload', (e) => {
    if (app.state.session.documents.some((d) => d.dirty)) e.preventDefault();
  });
  return () => life.abort();
}

async function start() {
  const root = document.getElementById('app');
  if (!root) return;
  try {
    initLang();
    const engine = await loadEngine();
    root.replaceChildren();
    const app = new App(engine);
    let dispose = mount(root, app);
    // Changing language rebuilds the interface; documents and settings live in `app` and stay.
    onLangChange(() => {
      dispose();
      app.detachUi();
      root.replaceChildren();
      dispose = mount(root, app);
      app.refresh();
      app.fitView();
    });
    (window as unknown as { photodesign: App }).photodesign = app;
  } catch (e) {
    root.replaceChildren(h('div.boot-error', h('h1', t('PhotoDesign could not start')), h('p', e instanceof Error ? e.message : String(e)), h('p', t('Build the engine first: npm run engine'))));
  }
}

void start();
