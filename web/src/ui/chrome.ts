// The frame around the canvas: top bar, tool dock, tool options, zoom control and toasts.
import type { App } from '../app';
import { nextBrushSize } from '../lib/keys';
import { centre, formatZoom, stepZoom, zoomAt } from '../lib/viewport';
import { TOOLS, toolDef } from '../tools/tools';
import { clear, h, icon } from './dom';
import { ICONS, type IconName } from './icons';

export interface ChromeActions {
  openPicker(): void;
  openPalette(): void;
  openMenu(anchor: HTMLElement): void;
  openNew(): void;
}

const iconButton = (name: IconName, title: string, onclick: (e: MouseEvent) => void, cls = '') =>
  h('button.icon-btn', { title, 'aria-label': title, onclick, class: cls }, icon(ICONS[name]));

export function topBar(app: App, actions: ChromeActions): HTMLElement {
  const tabs = h('div.doc-tabs', { role: 'tablist' });
  const undo = iconButton('undo', 'Undo (Ctrl+Z)', () => app.undo());
  const redo = iconButton('redo', 'Redo (Ctrl+Shift+Z)', () => app.redo());
  const exportMenu = h('div.export-menu', { hidden: true },
    ...[['png', 'PNG image'], ['jpg', 'JPEG photo'], ['webp', 'WebP image'], ['psd', 'Photoshop document'], ['tif', 'TIFF image'], ['pcraft', 'PhotoDesign document (.pcraft)']].map(([ext, label]) =>
      h('button.menu-item', { onclick: () => { exportMenu.hidden = true; app.exportAs(ext!); } }, h('span', label), h('span.menu-hint', `.${ext}`))),
  );
  const exportBtn = h('button.primary-btn', { onclick: (e: MouseEvent) => { e.stopPropagation(); exportMenu.hidden = !exportMenu.hidden; } }, icon(ICONS.export, 16), 'Export');
  document.addEventListener('click', () => (exportMenu.hidden = true));
  const menuBtn = h('button.ghost-btn', { onclick: (e: MouseEvent) => actions.openMenu(e.currentTarget as HTMLElement) }, icon(ICONS.menu, 16), 'Menu');
  const search = h('button.search-btn', { onclick: () => actions.openPalette(), title: 'Find any action (Ctrl+K)' }, icon(ICONS.search, 15), h('span', 'Find an action…'), h('kbd', 'Ctrl K'));

  const render = () => {
    clear(tabs);
    const s = app.state.session;
    for (const d of s.documents) {
      const tab = h('button.doc-tab', { role: 'tab', 'aria-selected': String(d.index === s.active), class: d.index === s.active ? 'active' : '', title: `${d.name} — ${d.width} × ${d.height}` },
        h('span.doc-tab-name', d.name), d.dirty ? h('span.dot', { title: 'Unsaved changes' }) : null,
        h('span.doc-tab-close', { title: 'Close', onclick: (e: MouseEvent) => { e.stopPropagation(); closeDocument(app, d.index, d.dirty); } }, icon(ICONS.close, 12)));
      tab.addEventListener('click', () => app.run('document.activate', { document: d.index }));
      tabs.appendChild(tab);
    }
    tabs.appendChild(h('button.doc-tab.add', { title: 'New document (Ctrl+N)', onclick: () => actions.openNew() }, icon(ICONS.plus, 14)));
    undo.disabled = !app.doc?.canUndo;
    redo.disabled = !app.doc?.canRedo;
    exportBtn.disabled = !app.doc;
  };
  app.on('state', render);
  render();

  return h('header.topbar',
    h('div.brand', icon(ICONS.logo, 20), h('span.brand-name', 'Photo', h('b', 'Design'))),
    menuBtn,
    tabs,
    h('div.topbar-spacer'),
    search,
    h('div.btn-group', undo, redo),
    h('div.export-wrap', exportBtn, exportMenu),
  );
}

export function toolDock(app: App): HTMLElement {
  const buttons = TOOLS.map((t) =>
    h('button.tool', { title: `${t.label} (${t.key}) — ${t.hint}`, 'aria-label': t.label, dataset: { tool: t.id }, onclick: () => app.tools.select(t.id) },
      icon(ICONS[t.id as IconName], 20), h('span.tool-key', t.key)));
  const fg = h('input.chip-input', { type: 'color', title: 'Foreground colour', 'aria-label': 'Foreground colour' }) as HTMLInputElement;
  const bg = h('input.chip-input', { type: 'color', title: 'Background colour', 'aria-label': 'Background colour' }) as HTMLInputElement;
  fg.addEventListener('change', () => app.setForeground(fg.value));
  bg.addEventListener('change', () => app.setBackground(bg.value));
  const fgChip = h('label.chip.fg', fg);
  const bgChip = h('label.chip.bg', bg);
  const render = () => {
    for (const b of buttons) {
      const id = b.dataset.tool;
      b.classList.toggle('active', id === app.tools.active);
      b.classList.toggle('held', id === app.tools.active && app.tools.isTemporary);
    }
    fg.value = app.foreground;
    bg.value = app.background;
    fgChip.style.background = app.foreground;
    bgChip.style.background = app.background;
  };
  app.on('tool', render);
  app.on('state', render);
  render();
  return h('nav.tool-dock', { 'aria-label': 'Tools' },
    h('div.tool-list', buttons),
    h('div.dock-sep'),
    h('div.chips', bgChip, fgChip),
    h('div.chip-actions',
      h('button.mini-btn', { title: 'Swap colours (X)', onclick: () => app.swapColors() }, icon(ICONS.swap, 14)),
      h('button.mini-btn.reset', { title: 'Black and white (D)', onclick: () => app.defaultColors() }, h('i'), h('i'))),
  );
}

function slider(label: string, min: number, max: number, step: number, value: number, format: (v: number) => string, onInput: (v: number) => void): HTMLElement {
  const out = h('output.slider-value', format(value));
  const input = h('input', { type: 'range', min, max, step, value: String(value), 'aria-label': label }) as HTMLInputElement;
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = format(v);
    onInput(v);
  });
  return h('label.opt-slider', h('span.opt-label', label), input, out);
}

export function toolOptions(app: App): HTMLElement {
  const el = h('div.tool-options');
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const render = () => {
    clear(el);
    const tool = app.tools.active;
    const def = toolDef(tool);
    el.append(h('span.opt-tool', icon(ICONS[tool as IconName], 15), def.label, app.tools.isTemporary ? h('span.opt-held', 'held') : null));
    if (tool === 'brush' || tool === 'eraser') {
      el.append(
        slider('Size', 1, 500, 1, app.brush.size, (v) => `${v}px`, (v) => app.setBrush({ size: v })),
        slider('Hardness', 0, 1, 0.01, app.brush.hardness, pct, (v) => app.setBrush({ hardness: v })),
        slider('Opacity', 0.01, 1, 0.01, app.brush.opacity, pct, (v) => app.setBrush({ opacity: v })),
        slider('Flow', 0.01, 1, 0.01, app.brush.flow, pct, (v) => app.setBrush({ flow: v })),
      );
    } else if (tool === 'fill') {
      const contiguous = h('input', { type: 'checkbox', checked: app.fill.contiguous }) as HTMLInputElement;
      contiguous.addEventListener('change', () => app.setFill({ contiguous: contiguous.checked }));
      el.append(slider('Tolerance', 0, 255, 1, app.fill.tolerance, (v) => String(v), (v) => app.setFill({ tolerance: v })), h('label.opt-check', contiguous, 'Connected only'));
    } else {
      el.append(h('span.opt-hint', def.hint));
    }
  };
  app.on('tool', render);
  app.on('settings', () => {
    const sizeOut = el.querySelector('.opt-slider output');
    if (sizeOut && (app.tools.active === 'brush' || app.tools.active === 'eraser')) render();
  });
  render();
  return el;
}

export function zoomControl(app: App): HTMLElement {
  const value = h('button.zoom-value', { title: 'Fit on screen (Ctrl+0)', onclick: () => app.fitView() });
  const mid = () => ({ x: app.viewport.width / 2, y: app.viewport.height / 2 });
  const el = h('div.zoom-pill',
    h('button.icon-btn.small', { title: 'Zoom out (Ctrl+-)', onclick: () => app.setView(zoomAt(app.view, stepZoom(app.view.zoom, -1), mid())) }, icon(ICONS.minus, 14)),
    value,
    h('button.icon-btn.small', { title: 'Zoom in (Ctrl+=)', onclick: () => app.setView(zoomAt(app.view, stepZoom(app.view.zoom, 1), mid())) }, icon(ICONS.plus, 14)),
    h('button.icon-btn.small', { title: 'Actual pixels (Ctrl+1)', onclick: () => app.doc && app.setView(centre(app.doc, app.viewport, 1)) }, h('span.one', '1:1')),
    h('button.icon-btn.small', { title: 'Fit on screen (Ctrl+0)', onclick: () => app.fitView() }, icon(ICONS.fit, 14)),
  );
  const render = () => {
    value.textContent = formatZoom(app.view.zoom);
    el.hidden = !app.doc;
  };
  app.on('view', render);
  app.on('state', render);
  render();
  return el;
}

export function toasts(app: App): HTMLElement {
  const el = h('div.toasts', { role: 'status', 'aria-live': 'polite' });
  app.on('toast', () => {
    clear(el);
    for (const t of app.toasts) el.append(h('div.toast', { class: t.kind }, t.text));
  });
  return el;
}

export function statusLine(app: App): HTMLElement {
  const el = h('footer.status');
  const render = () => {
    const d = app.doc;
    clear(el);
    if (!d) {
      el.append(h('span', 'No document open'));
      return;
    }
    el.append(
      h('span', `${d.width} × ${d.height} px`),
      h('span', `${d.mode.toUpperCase()} · ${d.depth}-bit`),
      h('span', `${Math.round(d.resolution)} ppi`),
      h('span.status-tool', `${toolDef(app.tools.active).label} · ${app.tools.active === 'brush' || app.tools.active === 'eraser' ? `${app.brush.size}px` : formatZoom(app.view.zoom)}`),
    );
  };
  app.on('state', render);
  app.on('tool', render);
  app.on('settings', render);
  app.on('view', render);
  render();
  return el;
}

function closeDocument(app: App, index: number, dirty: boolean) {
  if (dirty && !window.confirm('Close without exporting? Unsaved changes will be lost.')) return;
  app.run('file.close', { document: index });
}

export { nextBrushSize };
