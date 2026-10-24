// The frame around the canvas: top bar, tool dock, tool options, zoom control and toasts.
import type { App } from '../app';
import type { GradientStyle, SelectMode } from '../app';
import { LANGUAGES, getLang, setLang, t } from '../lib/i18n';
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
  const undo = iconButton('undo', t('Undo (Ctrl+Z)'), () => app.undo());
  const redo = iconButton('redo', t('Redo (Ctrl+Shift+Z)'), () => app.redo());
  const exportMenu = h('div.export-menu', { hidden: true },
    ...[['png', t('PNG image')], ['jpg', t('JPEG photo')], ['webp', t('WebP image')], ['psd', t('Photoshop document')], ['tif', t('TIFF image')], ['pcraft', t('PhotoDesign document (.pcraft)')]].map(([ext, label]) =>
      h('button.menu-item', { onclick: () => { exportMenu.hidden = true; app.exportAs(ext!); } }, h('span', label), h('span.menu-hint', `.${ext}`))),
  );
  const exportBtn = h('button.primary-btn', { onclick: (e: MouseEvent) => { e.stopPropagation(); exportMenu.hidden = !exportMenu.hidden; } }, icon(ICONS.export, 16), t('Export'));
  document.addEventListener('click', () => (exportMenu.hidden = true));
  const menuBtn = h('button.ghost-btn', { onclick: (e: MouseEvent) => actions.openMenu(e.currentTarget as HTMLElement) }, icon(ICONS.menu, 16), t('Menu'));
  const search = h('button.search-btn', { onclick: () => actions.openPalette(), title: t('Find any action (Ctrl+K)') }, icon(ICONS.search, 15), h('span', t('Find an action…')), h('kbd', 'Ctrl K'));

  const render = () => {
    clear(tabs);
    const s = app.state.session;
    for (const d of s.documents) {
      const tab = h('button.doc-tab', { role: 'tab', 'aria-selected': String(d.index === s.active), class: d.index === s.active ? 'active' : '', title: `${d.name} — ${d.width} × ${d.height}` },
        h('span.doc-tab-name', d.name), d.dirty ? h('span.dot', { title: t('Unsaved changes') }) : null,
        h('span.doc-tab-close', { title: t('Close'), onclick: (e: MouseEvent) => { e.stopPropagation(); closeDocument(app, d.index, d.dirty); } }, icon(ICONS.close, 12)));
      tab.addEventListener('click', () => app.run('document.activate', { document: d.index }));
      tabs.appendChild(tab);
    }
    tabs.appendChild(h('button.doc-tab.add', { title: t('New document (Ctrl+N)'), onclick: () => actions.openNew() }, icon(ICONS.plus, 14)));
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
    languageButton(),
    h('div.export-wrap', exportBtn, exportMenu),
  );
}

export function languageButton(): HTMLElement {
  const next = LANGUAGES.find((l) => l.id !== getLang()) ?? LANGUAGES[0]!;
  return h('button.ghost-btn.lang-btn', { title: `${t('Language')}: ${next.label}`, 'aria-label': t('Language'), onclick: () => setLang(next.id) }, icon(ICONS.globe, 15), next.label);
}

export function toolDock(app: App): HTMLElement {
  const buttons = TOOLS.map((tool) =>
    h('button.tool', { title: `${t(tool.label)} (${tool.key}) — ${t(tool.hint)}`, 'aria-label': t(tool.label), dataset: { tool: tool.id }, onclick: () => app.tools.select(tool.id) },
      icon(ICONS[tool.id as IconName], 20), h('span.tool-key', tool.key)));
  const fg = h('input.chip-input', { type: 'color', title: t('Foreground colour'), 'aria-label': t('Foreground colour') }) as HTMLInputElement;
  const bg = h('input.chip-input', { type: 'color', title: t('Background colour'), 'aria-label': t('Background colour') }) as HTMLInputElement;
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
      h('button.mini-btn', { title: t('Swap colours (X)'), onclick: () => app.swapColors() }, icon(ICONS.swap, 14)),
      h('button.mini-btn.reset', { title: t('Black and white (D)'), onclick: () => app.defaultColors() }, h('i'), h('i'))),
  );
}

function slider(label: string, min: number, max: number, step: number, value: number, format: (v: number) => string, onInput: (v: number) => void): HTMLElement {
  const out = h('output.slider-value', format(value));
  const input = h('input', { type: 'range', min, max, step, value: String(value), 'aria-label': t(label) }) as HTMLInputElement;
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = format(v);
    onInput(v);
  });
  return h('label.opt-slider', h('span.opt-label', t(label)), input, out);
}

const MODES: readonly [SelectMode, string][] = [['replace', 'Replace'], ['add', 'Add'], ['subtract', 'Subtract'], ['intersect', 'Intersect']];
const STYLES: readonly [GradientStyle, string][] = [['linear', 'Linear'], ['radial', 'Radial'], ['angle', 'Angle'], ['reflected', 'Reflected'], ['diamond', 'Diamond']];

function select<T extends string>(label: string, options: readonly (readonly [T, string])[], value: T, onChange: (v: T) => void): HTMLElement {
  const el = h('select', { 'aria-label': t(label) }, options.map(([v, text]) => h('option', { value: v, selected: v === value }, t(text)))) as HTMLSelectElement;
  el.addEventListener('change', () => onChange(el.value as T));
  return h('label.opt-slider', h('span.opt-label', t(label)), el);
}

export function toolOptions(app: App): HTMLElement {
  const el = h('div.tool-options');
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const render = () => {
    clear(el);
    const tool = app.tools.active;
    const def = toolDef(tool);
    el.append(h('span.opt-tool', icon(ICONS[tool as IconName], 15), t(def.label), app.tools.isTemporary ? h('span.opt-held', t('held')) : null));
    if (tool === 'brush' || tool === 'eraser') {
      el.append(
        slider('Size', 1, 500, 1, app.brush.size, (v) => `${v}px`, (v) => app.setBrush({ size: v })),
        slider('Hardness', 0, 1, 0.01, app.brush.hardness, pct, (v) => app.setBrush({ hardness: v })),
        slider('Opacity', 0.01, 1, 0.01, app.brush.opacity, pct, (v) => app.setBrush({ opacity: v })),
        slider('Flow', 0.01, 1, 0.01, app.brush.flow, pct, (v) => app.setBrush({ flow: v })),
      );
    } else if (tool === 'fill' || tool === 'wand') {
      const contiguous = h('input', { type: 'checkbox', checked: app.fill.contiguous }) as HTMLInputElement;
      contiguous.addEventListener('change', () => app.setFill({ contiguous: contiguous.checked }));
      if (tool === 'wand') el.append(select('Mode', MODES, app.select.mode, (v) => app.setSelect({ mode: v })));
      el.append(slider('Tolerance', 0, 255, 1, app.fill.tolerance, (v) => String(v), (v) => app.setFill({ tolerance: v })), h('label.opt-check', contiguous, t('Connected only')));
    } else if (tool === 'marquee' || tool === 'ellipse' || tool === 'lasso') {
      el.append(select('Mode', MODES, app.select.mode, (v) => app.setSelect({ mode: v })), slider('Feather', 0, 100, 1, app.select.feather, (v) => `${v}px`, (v) => app.setSelect({ feather: v })));
    } else if (tool === 'gradient') {
      el.append(select('Style', STYLES, app.gradientStyle, (v) => app.setGradientStyle(v)), h('span.opt-hint', `${app.foreground} → ${app.background}`));
    } else if (tool === 'crop') {
      const r = app.cropRect;
      el.append(h('span.opt-hint', r ? `${Math.round(r.width)} × ${Math.round(r.height)} px` : t(def.hint)));
      if (r) el.append(h('button.primary-btn.small', { onclick: () => app.applyCrop() }, t('Apply crop')), h('button.ghost-btn', { onclick: () => app.setCrop(null) }, t('Cancel')));
    } else {
      el.append(h('span.opt-hint', t(def.hint)));
    }
  };
  app.on('tool', render);
  app.on('crop', render);
  app.on('settings', () => {
    const tool = app.tools.active;
    if (tool === 'brush' || tool === 'eraser' || tool === 'gradient') render();
  });
  render();
  return el;
}

export function zoomControl(app: App): HTMLElement {
  const value = h('button.zoom-value', { title: t('Fit on screen (Ctrl+0)'), onclick: () => app.fitView() });
  const mid = () => ({ x: app.viewport.width / 2, y: app.viewport.height / 2 });
  const el = h('div.zoom-pill',
    h('button.icon-btn.small', { title: t('Zoom out (Ctrl+-)'), onclick: () => app.setView(zoomAt(app.view, stepZoom(app.view.zoom, -1), mid())) }, icon(ICONS.minus, 14)),
    value,
    h('button.icon-btn.small', { title: t('Zoom in (Ctrl+=)'), onclick: () => app.setView(zoomAt(app.view, stepZoom(app.view.zoom, 1), mid())) }, icon(ICONS.plus, 14)),
    h('button.icon-btn.small', { title: t('Actual pixels (Ctrl+1)'), onclick: () => app.doc && app.setView(centre(app.doc, app.viewport, 1)) }, h('span.one', '1:1')),
    h('button.icon-btn.small', { title: t('Fit on screen (Ctrl+0)'), onclick: () => app.fitView() }, icon(ICONS.fit, 14)),
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
    for (const toast of app.toasts) el.append(h('div.toast', { class: toast.kind }, toast.text));
  });
  return el;
}

export function statusLine(app: App): HTMLElement {
  const el = h('footer.status');
  const render = () => {
    const d = app.doc;
    clear(el);
    if (!d) {
      el.append(h('span', t('No document open')));
      return;
    }
    const tool = app.tools.active;
    el.append(
      h('span', `${d.width} × ${d.height} px`),
      h('span', `${d.mode.toUpperCase()} · ${d.depth}-bit`),
      h('span', `${Math.round(d.resolution)} ppi`),
      ...(d.selectionBounds ? [h('span', `${t('Selection')} ${d.selectionBounds[2]} × ${d.selectionBounds[3]}`)] : []),
      h('span.status-tool', `${t(toolDef(tool).label)} · ${tool === 'brush' || tool === 'eraser' ? `${app.brush.size}px` : formatZoom(app.view.zoom)}`),
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
  if (dirty && !window.confirm(t('Close without exporting? Unsaved changes will be lost.'))) return;
  app.run('file.close', { document: index });
}

export { nextBrushSize };
