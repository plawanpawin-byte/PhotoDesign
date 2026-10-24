// The frame around the canvas: menu bar, options bar, document tabs, tool strip, status bar and toasts.
import type { App } from '../app';
import type { GradientStyle, SelectMode } from '../app';
import { LANGUAGES, getLang, setLang, t } from '../lib/i18n';
import { nextBrushSize } from '../lib/keys';
import { centre, formatZoom, stepZoom, zoomAt } from '../lib/viewport';
import { GROUPS, STROKE_TOOLS, groupCurrent, toolDef, type ToolId } from '../tools/tools';
import { buildMenuTree } from '../lib/menu-tree';
import { CLIENT_MENUS } from './overlays';
import { clear, h, icon } from './dom';
import { ICONS, type IconName } from './icons';

export interface ChromeActions {
  openPicker(): void;
  openPalette(): void;
  openMenu(name: string, anchor: HTMLElement): void;
  openNew(): void;
}

const iconButton = (name: IconName, title: string, onclick: (e: MouseEvent) => void, cls = '') =>
  h('button.icon-btn', { title, 'aria-label': title, onclick, class: cls }, icon(ICONS[name]));

/** The top row: the app mark, the engine's menus as a horizontal menu bar, then search, undo/redo, language and export. */
export function menuBar(app: App, actions: ChromeActions): HTMLElement {
  const undo = iconButton('undo', t('Undo (Ctrl+Z)'), () => app.undo(), 'small');
  const redo = iconButton('redo', t('Redo (Ctrl+Shift+Z)'), () => app.redo(), 'small');
  const exportMenu = h('div.export-menu', { hidden: true },
    ...[['png', t('PNG image')], ['jpg', t('JPEG photo')], ['webp', t('WebP image')], ['psd', t('Photoshop document')], ['tif', t('TIFF image')], ['pcraft', t('PhotoDesign document (.pcraft)')]].map(([ext, label]) =>
      h('button.menu-item', { onclick: () => { exportMenu.hidden = true; app.exportAs(ext!); } }, h('span', label), h('span.menu-hint', `.${ext}`))),
  );
  const exportBtn = h('button.bar-btn', { onclick: (e: MouseEvent) => { e.stopPropagation(); exportMenu.hidden = !exportMenu.hidden; } }, icon(ICONS.export, 14), t('Export'));
  document.addEventListener('click', () => (exportMenu.hidden = true));
  const search = h('button.search-btn', { onclick: () => actions.openPalette(), title: t('Find any action (Ctrl+K)') }, icon(ICONS.search, 13), h('span', t('Find an action…')), h('kbd', 'Ctrl K'));
  const engineMenus = buildMenuTree(app.commands()).map((n) => n.name);
  const names = [...engineMenus, ...CLIENT_MENUS.filter((m) => !engineMenus.includes(m))];
  const items = names.map((name) =>
    h('button.menubar-item', { dataset: { menu: name }, onclick: (e: MouseEvent) => actions.openMenu(name, e.currentTarget as HTMLElement) }, t(name)));
  const render = () => {
    undo.disabled = !app.doc?.canUndo;
    redo.disabled = !app.doc?.canRedo;
    exportBtn.disabled = !app.doc;
  };
  app.on('state', render);
  render();
  return h('header.menubar',
    h('div.brand', { title: 'PhotoDesign' }, h('img.brand-logo', { src: './logo-64.png', alt: 'PhotoDesign', width: 18, height: 18 })),
    h('nav.menubar-items', { role: 'menubar' }, items),
    h('div.topbar-spacer'),
    search,
    h('div.btn-group', undo, redo),
    languageButton(),
    h('div.export-wrap', exportBtn, exportMenu),
  );
}

/** One tab per open document, in its own row above the canvas. */
export function docTabs(app: App, actions: ChromeActions): HTMLElement {
  const tabs = h('div.doc-tabs', { role: 'tablist' });
  const render = () => {
    clear(tabs);
    const s = app.state.session;
    for (const d of s.documents) {
      const zoom = d.index === s.active ? ` @ ${formatZoom(app.view.zoom)}` : '';
      const tab = h('button.doc-tab', { role: 'tab', 'aria-selected': String(d.index === s.active), class: d.index === s.active ? 'active' : '', title: `${d.name} — ${d.width} × ${d.height}` },
        h('span.doc-tab-name', d.name, h('span.doc-tab-meta', d.index === s.active && app.doc ? `${zoom} (${app.doc.mode.toUpperCase()}/${app.doc.depth})` : '')), d.dirty ? h('span.dot', { title: t('Unsaved changes') }) : null,
        h('span.doc-tab-close', { title: t('Close'), onclick: (e: MouseEvent) => { e.stopPropagation(); closeDocument(app, d.index, d.dirty); } }, icon(ICONS.close, 11)));
      tab.addEventListener('click', () => app.run('document.activate', { document: d.index }));
      tabs.appendChild(tab);
    }
    tabs.appendChild(h('button.doc-tab.add', { title: t('New document (Ctrl+N)'), onclick: () => actions.openNew() }, icon(ICONS.plus, 13)));
  };
  app.on('state', render);
  app.on('view', render);
  render();
  return h('div.doc-tabbar', tabs);
}

export function languageButton(): HTMLElement {
  const next = LANGUAGES.find((l) => l.id !== getLang()) ?? LANGUAGES[0]!;
  return h('button.bar-btn.lang-btn', { title: `${t('Language')}: ${next.label}`, 'aria-label': t('Language'), onclick: () => setLang(next.id) }, icon(ICONS.globe, 13), next.label);
}

/** The tool strip, docked to the left edge from the options bar down to the status bar. */
export function toolDock(app: App): HTMLElement {
  let fly: HTMLElement | null = null;
  const closeFly = () => {
    fly?.remove();
    fly = null;
  };
  document.addEventListener('pointerdown', (e) => {
    if (fly && !fly.contains(e.target as Node)) closeFly();
  });
  const openFly = (slot: HTMLElement, group: readonly ToolId[]) => {
    closeFly();
    const r = slot.getBoundingClientRect();
    fly = h('div.tool-fly', { role: 'menu', style: { left: `${r.right + 2}px`, top: `${r.top}px` } },
      group.map((id) => {
        const def = toolDef(id);
        return h('button.tool-fly-item', { role: 'menuitem', dataset: { tool: id }, class: id === app.tools.active ? 'active' : '', onclick: () => { closeFly(); app.tools.select(id); } },
          icon(ICONS[id as IconName], 16), h('span', t(def.label)), h('kbd', def.key));
      }));
    document.body.append(fly);
  };
  const buttons = GROUPS.map((group) => {
    const b = h('button.tool', { 'aria-haspopup': group.length > 1 ? 'menu' : null }) as HTMLButtonElement;
    let holdTimer = 0;
    b.addEventListener('click', () => app.tools.select(b.dataset.tool as ToolId));
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (group.length > 1) openFly(b, group);
    });
    b.addEventListener('pointerdown', () => {
      window.clearTimeout(holdTimer);
      if (group.length > 1) holdTimer = window.setTimeout(() => openFly(b, group), 450);
    });
    for (const ev of ['pointerup', 'pointerleave']) b.addEventListener(ev, () => window.clearTimeout(holdTimer));
    return { b, group };
  });
  const paintSlots = () => {
    for (const { b, group } of buttons) {
      const id = group.includes(app.tools.active) ? app.tools.active : groupCurrent(group);
      const def = toolDef(id);
      if (b.dataset.tool !== id) {
        b.dataset.tool = id;
        b.replaceChildren(icon(ICONS[id as IconName], 17), ...(group.length > 1 ? [h('span.tool-more')] : []));
      }
      b.title = `${t(def.label)} (${def.key}) — ${t(def.hint)}${group.length > 1 ? ` · ${t('right-click for more')}` : ''}`;
      b.setAttribute('aria-label', t(def.label));
    }
  };
  const fg = h('input.chip-input', { type: 'color', title: t('Foreground colour'), 'aria-label': t('Foreground colour') }) as HTMLInputElement;
  const bg = h('input.chip-input', { type: 'color', title: t('Background colour'), 'aria-label': t('Background colour') }) as HTMLInputElement;
  fg.addEventListener('change', () => app.setForeground(fg.value));
  bg.addEventListener('change', () => app.setBackground(bg.value));
  const fgChip = h('label.chip.fg', fg);
  const bgChip = h('label.chip.bg', bg);
  const render = () => {
    paintSlots();
    for (const { b } of buttons) {
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
    h('div.tool-list', buttons.map((x) => x.b)),
    h('div.dock-sep'),
    h('div.chip-actions',
      h('button.mini-btn.reset', { title: t('Black and white (D)'), onclick: () => app.defaultColors() }, h('i'), h('i')),
      h('button.mini-btn', { title: t('Swap colours (X)'), onclick: () => app.swapColors() }, icon(ICONS.swap, 11))),
    h('div.chips', bgChip, fgChip),
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
    const sizeRow = () => slider('Size', 1, 500, 1, app.brush.size, (v) => `${v}px`, (v) => app.setBrush({ size: v }));
    const hardRow = () => slider('Hardness', 0, 1, 0.01, app.brush.hardness, pct, (v) => app.setBrush({ hardness: v }));
    const opRow = () => slider('Opacity', 0.01, 1, 0.01, app.brush.opacity, pct, (v) => app.setBrush({ opacity: v }));
    const flowRow = () => slider('Flow', 0.01, 1, 0.01, app.brush.flow, pct, (v) => app.setBrush({ flow: v }));
    const r = app.retouch;
    if (tool === 'brush' || tool === 'eraser') {
      el.append(sizeRow(), hardRow(), opRow(), flowRow());
    } else if (tool === 'pencil') {
      el.append(sizeRow(), opRow());
    } else if (tool === 'mixer' || tool === 'colorReplace') {
      el.append(sizeRow());
    } else if (tool === 'backgroundEraser') {
      el.append(sizeRow(), hardRow());
    } else if (tool === 'cloneStamp' || tool === 'healing') {
      const aligned = h('input', { type: 'checkbox', checked: r.aligned }) as HTMLInputElement;
      aligned.addEventListener('change', () => app.setRetouch({ aligned: aligned.checked }));
      el.append(sizeRow(), hardRow(), opRow(), h('label.opt-check', aligned, t('Aligned')),
        h('span.opt-hint', app.cloneSource ? `${t('Source')} ${app.cloneSource.x}, ${app.cloneSource.y}` : t('Alt-click to set a source first')));
    } else if (tool === 'spotHealing') {
      el.append(sizeRow(), select('Type', [['contentAware', 'Content-Aware'], ['createTexture', 'Create Texture'], ['proximityMatch', 'Proximity Match']] as const, r.healType, (v) => app.setRetouch({ healType: v })));
    } else if (tool === 'patternStamp' || tool === 'historyBrush') {
      el.append(sizeRow(), hardRow(), opRow());
    } else if (tool === 'blur' || tool === 'sharpen' || tool === 'smudge') {
      el.append(sizeRow(), hardRow(), slider('Strength', 1, 100, 1, r.strength, (v) => `${v}%`, (v) => app.setRetouch({ strength: v })));
    } else if (tool === 'dodge' || tool === 'burn') {
      el.append(sizeRow(), select('Range', [['shadows', 'Shadows'], ['midtones', 'Midtones'], ['highlights', 'Highlights']] as const, r.range, (v) => app.setRetouch({ range: v })),
        slider('Exposure', 1, 100, 1, r.exposure, (v) => `${v}%`, (v) => app.setRetouch({ exposure: v })));
    } else if (tool === 'sponge') {
      el.append(sizeRow(), select('Mode', [['desaturate', 'Desaturate'], ['saturate', 'Saturate']] as const, r.spongeMode, (v) => app.setRetouch({ spongeMode: v })), flowRow());
    } else if (tool === 'quickSelect') {
      el.append(select('Mode', MODES, app.select.mode, (v) => app.setSelect({ mode: v })), sizeRow());
    } else if (tool === 'fill' || tool === 'wand' || tool === 'magicEraser') {
      const contiguous = h('input', { type: 'checkbox', checked: app.fill.contiguous }) as HTMLInputElement;
      contiguous.addEventListener('change', () => app.setFill({ contiguous: contiguous.checked }));
      if (tool === 'wand') el.append(select('Mode', MODES, app.select.mode, (v) => app.setSelect({ mode: v })));
      el.append(slider('Tolerance', 0, 255, 1, app.fill.tolerance, (v) => String(v), (v) => app.setFill({ tolerance: v })), h('label.opt-check', contiguous, t('Connected only')));
    } else if (tool === 'marquee' || tool === 'ellipse' || tool === 'lasso' || tool === 'magneticLasso') {
      el.append(select('Mode', MODES, app.select.mode, (v) => app.setSelect({ mode: v })), slider('Feather', 0, 100, 1, app.select.feather, (v) => `${v}px`, (v) => app.setSelect({ feather: v })));
    } else if (tool === 'objectSelect') {
      el.append(select('Mode', MODES, app.select.mode, (v) => app.setSelect({ mode: v })), h('button.bar-btn.ghost-btn', { onclick: () => app.run('select.subject', { mode: app.select.mode }) }, t('Select Subject')));
    } else if (tool === 'type') {
      el.append(slider('Size', 4, 400, 1, r.typeSize, (v) => `${v}pt`, (v) => app.setRetouch({ typeSize: v })), h('span.opt-hint', `${t('Colour')} ${app.foreground}`));
    } else if (tool === 'lineShape') {
      el.append(slider('Weight', 1, 100, 1, r.lineWeight, (v) => `${v}px`, (v) => app.setRetouch({ lineWeight: v })), h('span.opt-hint', `${t('Fill')} ${app.foreground}`));
    } else if (tool === 'rectShape' || tool === 'ellipseShape') {
      el.append(h('span.opt-hint', `${t('Fill')} ${app.foreground} · ${t(def.hint)}`));
    } else if (tool === 'gradient') {
      el.append(select('Style', STYLES, app.gradientStyle, (v) => app.setGradientStyle(v)), h('span.opt-hint', `${app.foreground} → ${app.background}`));
    } else if (tool === 'crop') {
      const cr = app.cropRect;
      el.append(h('span.opt-hint', cr ? `${Math.round(cr.width)} × ${Math.round(cr.height)} px` : t(def.hint)));
      if (cr) el.append(h('button.primary-btn.small', { onclick: () => app.applyCrop() }, t('Apply crop')), h('button.ghost-btn', { onclick: () => app.setCrop(null) }, t('Cancel')));
    } else {
      el.append(h('span.opt-hint', t(def.hint)));
    }
  };
  app.on('tool', render);
  app.on('crop', render);
  app.on('settings', () => {
    // Rebuild only when a value shown as text changed; a slider being dragged keeps its element.
    if (!el.contains(document.activeElement) || document.activeElement?.tagName !== 'INPUT') render();
  });
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

/** The bottom row: zoom on the left (type a percentage or step it), then document facts and the tool. */
export function statusLine(app: App): HTMLElement {
  const mid = () => ({ x: app.viewport.width / 2, y: app.viewport.height / 2 });
  const zoomInput = h('input.zoom-input', { type: 'text', 'aria-label': t('Zoom'), title: t('Zoom — type a percentage and press Enter') }) as HTMLInputElement;
  zoomInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const pct = parseFloat(zoomInput.value);
    if (Number.isFinite(pct) && pct > 0) app.setView(zoomAt(app.view, pct / 100, mid()));
    zoomInput.blur();
  });
  zoomInput.addEventListener('blur', () => (zoomInput.value = formatZoom(app.view.zoom)));
  const zoom = h('div.status-zoom',
    zoomInput,
    h('button.icon-btn.tiny', { title: t('Zoom out (Ctrl+-)'), onclick: () => app.setView(zoomAt(app.view, stepZoom(app.view.zoom, -1), mid())) }, icon(ICONS.minus, 12)),
    h('button.icon-btn.tiny', { title: t('Zoom in (Ctrl+=)'), onclick: () => app.setView(zoomAt(app.view, stepZoom(app.view.zoom, 1), mid())) }, icon(ICONS.plus, 12)),
    h('button.icon-btn.tiny', { title: t('Actual pixels (Ctrl+1)'), onclick: () => app.doc && app.setView(centre(app.doc, app.viewport, 1)) }, h('span.one', '1:1')),
    h('button.icon-btn.tiny', { title: t('Fit on screen (Ctrl+0)'), onclick: () => app.fitView() }, icon(ICONS.fit, 12)),
  );
  const info = h('div.status-info');
  const el = h('footer.status', zoom, info);
  const render = () => {
    const d = app.doc;
    zoom.hidden = !d;
    if (document.activeElement !== zoomInput) zoomInput.value = formatZoom(app.view.zoom);
    clear(info);
    if (!d) {
      info.append(h('span', t('No document open')));
      return;
    }
    const tool = app.tools.active;
    info.append(
      h('span', `${d.width} × ${d.height} px`),
      h('span', `${d.mode.toUpperCase()} · ${d.depth}-bit`),
      h('span', `${Math.round(d.resolution)} ppi`),
      ...(d.selectionBounds ? [h('span', `${t('Selection')} ${d.selectionBounds[2]} × ${d.selectionBounds[3]}`)] : []),
      h('span.status-tool', `${t(toolDef(tool).label)}${STROKE_TOOLS.includes(tool) ? ` · ${app.brush.size}px` : ''}`),
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
