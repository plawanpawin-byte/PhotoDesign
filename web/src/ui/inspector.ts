// The panel dock on the right: three stacked groups like a desk of tools —
// Color and Swatches on top, Properties, Adjustments and History in the middle, Layers below.
import type { App } from '../app';
import { findLayer } from '../app';
import type { LayerInfo } from '../engine/types';
import { fromHex } from '../lib/color';
import { t } from '../lib/i18n';
import { clear, h, icon } from './dom';
import { ICONS } from './icons';

type Tab = 'color' | 'swatches' | 'image' | 'adjust' | 'history' | 'layers';
const TAB_LABEL: Record<Tab, string> = { color: 'Color', swatches: 'Swatches', image: 'Properties', adjust: 'Adjustments', history: 'History', layers: 'Layers' };
/** Views holding slider positions: they rebuild only on tab or document change, not on every state change. */
const STICKY: readonly Tab[] = ['adjust', 'image'];
/** The open tab of each group survives a rebuild of the interface (language change). */
const remembered = new Map<string, Tab>();
const collapsed = new Set<string>();

const BLENDS = ['Normal', 'Dissolve', 'Darken', 'Multiply', 'Color Burn', 'Linear Burn', 'Lighten', 'Screen', 'Color Dodge', 'Linear Dodge (Add)', 'Overlay', 'Soft Light', 'Hard Light', 'Vivid Light', 'Linear Light', 'Pin Light', 'Hard Mix', 'Difference', 'Exclusion', 'Subtract', 'Divide', 'Hue', 'Saturation', 'Color', 'Luminosity'];

export function panelDock(app: App): HTMLElement {
  return h('aside.panel-dock',
    panelGroup(app, 'top', ['color', 'swatches']),
    panelGroup(app, 'middle', ['image', 'adjust', 'history']),
    panelGroup(app, 'bottom', ['layers']),
  );
}

function panelGroup(app: App, id: string, tabs: readonly Tab[]): HTMLElement {
  let tab: Tab = remembered.get(id) ?? tabs[0]!;
  const body = h('div.panel-body');
  const group = h('section.panel-group', { dataset: { group: id }, class: collapsed.has(id) ? 'collapsed' : '' });
  const buttons = tabs.map((tb) =>
    h('button.seg', { role: 'tab', dataset: { tab: tb }, onclick: () => { tab = tb; remembered.set(id, tb); collapsed.delete(id); group.classList.remove('collapsed'); render(); } }, t(TAB_LABEL[tb])));
  const toggle = h('button.panel-collapse', { title: t('Collapse'), onclick: () => { group.classList.toggle('collapsed'); if (group.classList.contains('collapsed')) collapsed.add(id); else collapsed.delete(id); } }, icon(ICONS.chevron, 12));
  const render = () => {
    if (tab === 'adjust' || tabs.includes('adjust')) app.setPreview(null);
    for (const b of buttons) b.classList.toggle('active', b.dataset.tab === tab);
    clear(body);
    if (tab === 'color') return void body.append(colorView(app));
    if (tab === 'swatches') return void body.append(swatchesView(app));
    if (!app.doc) {
      body.append(h('p.empty-note', t(tab === 'layers' ? 'No document' : 'No properties')));
      return;
    }
    body.append(tab === 'layers' ? layersView(app) : tab === 'adjust' ? adjustView(app) : tab === 'image' ? imageView(app) : historyView(app));
  };
  let docKey = '';
  app.on('state', () => {
    const key = `${app.state.session.active}`;
    const changedDoc = key !== docKey;
    docKey = key;
    if (!STICKY.includes(tab) || changedDoc || !body.querySelector('.adjust, .imageview')) render();
  });
  docKey = `${app.state.session.active}`;
  render();
  group.append(h('header.panel-head', h('div.panel-tabs', { role: 'tablist' }, buttons), toggle), body);
  return group;
}

function colorView(app: App): HTMLElement {
  const hex = h('input.hex-input', { type: 'text', maxlength: 7, 'aria-label': t('Hex colour') }) as HTMLInputElement;
  const fields = (['R', 'G', 'B'] as const).map((c) => h('input.num-input', { type: 'number', min: 0, max: 255, 'aria-label': c }) as HTMLInputElement);
  const big = h('label.color-big', h('input.chip-input', { type: 'color', 'aria-label': t('Foreground colour'), onchange: (e: Event) => app.setForeground((e.target as HTMLInputElement).value) }));
  const small = h('label.color-small', h('input.chip-input', { type: 'color', 'aria-label': t('Background colour'), onchange: (e: Event) => app.setBackground((e.target as HTMLInputElement).value) }));
  const ramp = h('div.color-ramp', { title: t('Pick a hue') });
  const shade = h('div.color-shade', { title: t('Pick a shade') });
  const toHex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  const hsv = (hh: number, sat: number, val: number) => {
    const f = (n: number) => {
      const k = (n + hh / 60) % 6;
      return val - val * sat * Math.max(0, Math.min(k, 4 - k, 1));
    };
    return `#${toHex2(f(5) * 255)}${toHex2(f(3) * 255)}${toHex2(f(1) * 255)}`;
  };
  let hue = 210;
  const paintShade = () => (shade.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hsv(hue, 1, 1)})`);
  const pick = (el: HTMLElement, e: PointerEvent, fn: (x: number, y: number) => void) => {
    const r = el.getBoundingClientRect();
    fn(Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width))), Math.min(1, Math.max(0, (e.clientY - r.top) / Math.max(1, r.height))));
  };
  ramp.addEventListener('pointerdown', (e) => pick(ramp, e, (_x, y) => { hue = y * 360; paintShade(); }));
  shade.addEventListener('pointerdown', (e) => pick(shade, e, (x, y) => app.setForeground(hsv(hue, x, 1 - y))));
  const sync = () => {
    hex.value = app.foreground;
    const rgb = fromHex(app.foreground) ?? [0, 0, 0];
    fields.forEach((f, i) => (f.value = String(Math.round(rgb[i]! * 255))));
    big.style.background = app.foreground;
    small.style.background = app.background;
    (big.firstChild as HTMLInputElement).value = app.foreground;
    (small.firstChild as HTMLInputElement).value = app.background;
  };
  hex.addEventListener('change', () => {
    const v = hex.value.startsWith('#') ? hex.value : `#${hex.value}`;
    if (fromHex(v)) app.setForeground(v);
    else sync();
  });
  for (const f of fields) f.addEventListener('change', () => app.setForeground(`#${fields.map((x) => toHex2(Number(x.value) || 0)).join('')}`));
  app.on('state', sync);
  sync();
  paintShade();
  return h('div.color-panel',
    h('div.color-chips', small, big),
    shade, ramp,
    h('div.color-fields', h('span.field-tag', '#'), hex, ...fields.flatMap((f, i) => [h('span.field-tag', 'RGB'[i]!), f])));
}

const SWATCHES = ['#000000', '#ffffff', '#7f7f7f', '#c3c3c3', '#ff0000', '#ff7f00', '#ffff00', '#7fff00', '#00ff00', '#00ff7f', '#00ffff', '#007fff', '#0000ff', '#7f00ff', '#ff00ff', '#ff007f', '#7f0000', '#7f3f00', '#7f7f00', '#3f7f00', '#007f00', '#007f3f', '#007f7f', '#003f7f', '#00007f', '#3f007f', '#7f007f', '#7f003f', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#cfe2f3', '#d9d2e9', '#ead1dc'];

function swatchesView(app: App): HTMLElement {
  return h('div.swatch-grid', SWATCHES.map((c) =>
    h('button.swatch', { title: `${c} — ${t('click: foreground · Alt+click: background')}`, style: { background: c }, onclick: (e: MouseEvent) => (e.altKey ? app.setBackground(c) : app.setForeground(c)) })));
}

function layersView(app: App): HTMLElement {
  const doc = app.doc!;
  const active = app.activeLayer();
  const list = h('ul.layer-list', { role: 'listbox', 'aria-label': 'Layers' });
  const addRows = (layers: LayerInfo[], depth: number) => {
    for (const l of layers) {
      const eye = h('button.layer-eye', { title: t(l.visible ? 'Hide' : 'Show'), onclick: (e: MouseEvent) => { e.stopPropagation(); app.run('layer.setProps', { layer: l.id, visible: !l.visible }); } }, icon(l.visible ? ICONS.eye : ICONS.eyeOff, 15));
      const name = h('span.layer-name', l.name);
      name.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const next = window.prompt(t('Layer name'), l.name);
        if (next && next.trim() && next !== l.name) app.run('layer.setProps', { layer: l.id, name: next.trim() });
      });
      const row = h('li.layer-row', { role: 'option', 'aria-selected': String(l.id === doc.activeLayer), class: [l.id === doc.activeLayer ? 'active' : '', l.visible ? '' : 'hidden-layer'].join(' '), style: { paddingLeft: `${8 + depth * 14}px` }, title: `${l.kind} ${t('layer — double-click the name to rename')}` },
        eye, h('span.layer-kind', kindBadge(l.kind)), name, l.opacity < 1 ? h('span.layer-meta', `${Math.round(l.opacity * 100)}%`) : null, l.blend !== 'Normal' ? h('span.layer-meta', l.blend) : null);
      row.addEventListener('click', () => app.run('layer.select', { layer: l.id }));
      list.append(row);
      if (l.children?.length) addRows(l.children, depth + 1);
    }
  };
  addRows(doc.layers, 0);

  const props = h('div.layer-props');
  if (active) {
    const blend = h('select', { 'aria-label': 'Blend mode' }, BLENDS.map((b) => h('option', { value: b, selected: b === active.blend }, b))) as HTMLSelectElement;
    if (!BLENDS.includes(active.blend)) blend.prepend(h('option', { value: active.blend, selected: true }, active.blend));
    blend.addEventListener('change', () => app.run('layer.setProps', { layer: active.id, blend: blend.value }));
    const opacity = h('input', { type: 'range', min: 0, max: 100, step: 1, value: String(Math.round(active.opacity * 100)), 'aria-label': 'Opacity' }) as HTMLInputElement;
    const out = h('output', `${Math.round(active.opacity * 100)}%`);
    opacity.addEventListener('input', () => (out.textContent = `${opacity.value}%`));
    opacity.addEventListener('change', () => app.run('layer.setProps', { layer: active.id, opacity: Number(opacity.value) / 100 }));
    props.append(h('div.prop-row', h('span.prop-label', t('Blend')), blend), h('div.prop-row', h('span.prop-label', t('Opacity')), opacity, out));
  }
  const actions = h('div.layer-actions',
    h('button.icon-btn', { title: t('New layer'), onclick: () => app.run('layer.new.layer', {}) }, icon(ICONS.plus, 16)),
    h('button.icon-btn', { title: t('Duplicate layer'), disabled: !active, onclick: () => app.run('layer.duplicate', {}) }, icon(ICONS.copy, 16)),
    h('button.icon-btn', { title: t('Merge down'), disabled: !active, onclick: () => app.run('layer.mergeDown', {}) }, h('span.txt-icon', '⤓')),
    h('div.flex'),
    h('button.icon-btn.danger', { title: t('Delete layer'), disabled: !active, onclick: () => app.run('layer.delete', {}) }, icon(ICONS.trash, 16)),
  );
  return h('div.layers', props, list, actions);
}

function kindBadge(kind: string): string {
  switch (kind) {
    case 'Pixel': return 'Px';
    case 'Group': return 'Gr';
    case 'Adjustment': return 'Adj';
    case 'Fill': return 'Fill';
    case 'Type': return 'T';
    case 'Shape': return 'Sh';
    case 'Smart Object': return 'SO';
    default: return kind.slice(0, 2);
  }
}

interface AdjustControl {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
}

interface AdjustGroup {
  title: string;
  note: string;
  command: string;
  controls: AdjustControl[];
}

export const ADJUST_GROUPS: readonly AdjustGroup[] = [
  { title: 'Light', note: 'Brightness and contrast', command: 'image.adjustments.brightnessContrast', controls: [
    { key: 'brightness', label: 'Brightness', min: -150, max: 150, step: 1, value: 0 },
    { key: 'contrast', label: 'Contrast', min: -50, max: 100, step: 1, value: 0 },
  ] },
  { title: 'Exposure', note: 'Stops of light', command: 'image.adjustments.exposure', controls: [
    { key: 'exposure', label: 'Exposure', min: -5, max: 5, step: 0.05, value: 0 },
    { key: 'gamma', label: 'Gamma', min: 0.1, max: 3, step: 0.01, value: 1 },
  ] },
  { title: 'Colour', note: 'Hue, saturation and lightness', command: 'image.adjustments.hueSaturation', controls: [
    { key: 'hue', label: 'Hue', min: -180, max: 180, step: 1, value: 0 },
    { key: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1, value: 0 },
    { key: 'lightness', label: 'Lightness', min: -100, max: 100, step: 1, value: 0 },
  ] },
  { title: 'Vibrance', note: 'Gentle saturation that protects skin tones', command: 'image.adjustments.vibrance', controls: [
    { key: 'vibrance', label: 'Vibrance', min: -100, max: 100, step: 1, value: 0 },
  ] },
  { title: 'Soften', note: 'Gaussian blur', command: 'filter.blur.gaussianBlur', controls: [
    { key: 'radius', label: 'Radius', min: 0.1, max: 100, step: 0.1, value: 2 },
  ] },
  { title: 'Sharpen', note: 'Unsharp mask', command: 'filter.sharpen.unsharpMask', controls: [
    { key: 'amount', label: 'Amount', min: 1, max: 500, step: 1, value: 80 },
    { key: 'radius', label: 'Radius', min: 0.1, max: 50, step: 0.1, value: 1.5 },
  ] },
  { title: 'Mosaic', note: 'Flat blocks of colour', command: 'filter.pixelate.mosaic', controls: [
    { key: 'cellSize', label: 'Cell size', min: 2, max: 200, step: 1, value: 10 },
  ] },
  { title: 'Emboss', note: 'Grey relief', command: 'filter.stylize.emboss', controls: [
    { key: 'angle', label: 'Angle', min: -180, max: 180, step: 1, value: 135 },
    { key: 'height', label: 'Height', min: 1, max: 100, step: 1, value: 3 },
    { key: 'amount', label: 'Amount', min: 1, max: 500, step: 1, value: 100 },
  ] },
  { title: 'High pass', note: 'Keep only fine detail', command: 'filter.other.highPass', controls: [
    { key: 'radius', label: 'Radius', min: 0.1, max: 250, step: 0.1, value: 10 },
  ] },
];

const QUICK: readonly [string, string][] = [
  ['image.autoTone', 'Auto tone'],
  ['image.autoContrast', 'Auto contrast'],
  ['image.autoColor', 'Auto colour'],
  ['image.adjustments.desaturate', 'Black & white'],
  ['image.adjustments.invert', 'Invert'],
];

/** Draws the active layer's tone as a histogram, worked out in the browser from a small render. */
function histogramView(app: App): HTMLElement {
  const canvas = h('canvas.histogram', { width: 256, height: 64, 'aria-label': t('Histogram') }) as HTMLCanvasElement;
  const draw = () => {
    const ctx = canvas.getContext('2d');
    if (!ctx || !app.doc) return;
    ctx.clearRect(0, 0, 256, 64);
    try {
      const frame = app.engine.render(192);
      const bins = app.engine.histogram(frame.pixels);
      const peak = Math.max(1, ...bins.slice(768 + 1, 768 + 255));
      ctx.globalCompositeOperation = 'lighter';
      for (const [channel, color] of [[0, '#f0506e'], [1, '#46c882'], [2, '#4a86e8']] as const) {
        ctx.fillStyle = color;
        for (let i = 0; i < 256; i++) {
          const n = Math.min(64, (bins[channel * 256 + i]! / peak) * 64);
          ctx.globalAlpha = 0.55;
          ctx.fillRect(i, 64 - n, 1, n);
        }
      }
    } catch {
      /* no render available: leave the graph empty */
    }
  };
  queueMicrotask(draw);
  return h('div.histogram-box', canvas);
}

function adjustView(app: App): HTMLElement {
  const quick = h('div.quick-row', QUICK.map(([id, label]) => h('button.chip-btn', { onclick: () => app.run(id) }, t(label))));
  const cards = ADJUST_GROUPS.map((g) => {
    const values: Record<string, number> = {};
    const rows = g.controls.map((c) => {
      values[c.key] = c.value;
      const input = h('input', { type: 'range', min: c.min, max: c.max, step: c.step, value: String(c.value), 'aria-label': c.label }) as HTMLInputElement;
      const out = h('output', String(c.value));
      input.addEventListener('input', () => {
        values[c.key] = Number(input.value);
        out.textContent = input.value;
        app.setPreview({ command: g.command, values: { ...values } });
      });
      input.addEventListener('dblclick', () => {
        input.value = String(c.value);
        values[c.key] = c.value;
        out.textContent = String(c.value);
        app.setPreview({ command: g.command, values: { ...values } });
      });
      return h('div.prop-row', h('span.prop-label', t(c.label)), input, out);
    });
    return h('details.adjust-card', { open: g.title === 'Light' },
      h('summary', h('span.adjust-title', t(g.title)), h('span.adjust-note', t(g.note)), icon(ICONS.chevron, 14)),
      rows,
      h('div.adjust-actions', h('button.primary-btn.small', { onclick: () => app.run(g.command, { ...values }) }, t('Apply to layer'))),
    );
  });
  return h('div.adjust', histogramView(app), h('p.section-label', icon(ICONS.sparkle, 13), t('One click')), quick, h('p.section-label', t('Fine tune')), cards, h('p.foot-note', t('Changes apply to the selected layer and can be undone.')));
}

function actionButton(app: App, iconName: keyof typeof ICONS, label: string, command: string, params: Record<string, unknown> = {}, enabled = true): HTMLElement {
  return h('button.tile-btn', { disabled: !enabled, title: t(label), onclick: () => app.run(command, params) }, icon(ICONS[iconName], 18), h('span', t(label)));
}

export function imageView(app: App): HTMLElement {
  const doc = app.doc!;
  const has = doc.hasSelection;
  const w = h('input', { type: 'number', min: 1, max: 300000, value: String(doc.width), 'aria-label': t('Width (px)') }) as HTMLInputElement;
  const ht = h('input', { type: 'number', min: 1, max: 300000, value: String(doc.height), 'aria-label': t('Height (px)') }) as HTMLInputElement;
  const lock = h('input', { type: 'checkbox', checked: true, 'aria-label': 'Lock' }) as HTMLInputElement;
  const ratio = doc.width / Math.max(1, doc.height);
  w.addEventListener('input', () => { if (lock.checked && Number(w.value) > 0) ht.value = String(Math.max(1, Math.round(Number(w.value) / ratio))); });
  ht.addEventListener('input', () => { if (lock.checked && Number(ht.value) > 0) w.value = String(Math.max(1, Math.round(Number(ht.value) * ratio))); });
  const resize = () => {
    const width = Math.round(Number(w.value));
    const height = Math.round(Number(ht.value));
    if (!(width >= 1 && height >= 1)) {
      app.notify(t('Width and height must be between 1 and 300,000 pixels.'), 'error');
      return;
    }
    app.run('image.imageSize', { width, height });
    app.fitView();
  };
  return h('div.imageview',
    h('p.section-label', t('Transform')),
    h('div.tile-grid',
      actionButton(app, 'rotateL', 'Rotate left', 'image.imageRotation.90ccw'),
      actionButton(app, 'rotateR', 'Rotate right', 'image.imageRotation.90cw'),
      actionButton(app, 'rotateR', 'Rotate 180°', 'image.imageRotation.180'),
      actionButton(app, 'flipH', 'Flip horizontal', 'image.imageRotation.flipCanvasHorizontal'),
      actionButton(app, 'flipV', 'Flip vertical', 'image.imageRotation.flipCanvasVertical')),
    h('p.section-label', t('Image size')),
    h('div.size-row', h('label.field', h('span', t('Width (px)')), w), h('label.opt-check.lock', lock, '🔗'), h('label.field', h('span', t('Height (px)')), ht)),
    h('div.adjust-actions', h('button.primary-btn.small', { onclick: resize }, t('Resize image'))),
    h('p.section-label', t('Selection')),
    h('div.tile-grid',
      actionButton(app, 'marquee', 'Select all', 'select.all'),
      actionButton(app, 'close', 'Deselect', 'select.deselect', {}, has),
      actionButton(app, 'swap', 'Invert selection', 'select.inverse', {}, has),
      actionButton(app, 'plus', 'Grow selection', 'select.modify.expand', { radius: 4 }, has),
      actionButton(app, 'minus', 'Shrink selection', 'select.modify.contract', { radius: 4 }, has),
      actionButton(app, 'sparkle', 'Soften edge', 'select.modify.feather', { radius: 4 }, has),
      actionButton(app, 'fill', 'Fill selection', 'edit.fillForeground', {}, has),
      actionButton(app, 'trash', 'Clear selection contents', 'edit.clear', {}, has)),
    has ? null : h('p.foot-note', t('Nothing is selected')),
  );
}

function historyView(app: App): HTMLElement {
  const doc = app.doc!;
  const entries = doc.history;
  const current = entries.length - 1;
  const list = h('ol.history-list');
  entries.forEach((label, i) => {
    const row = h('li.history-row', { class: i === current ? 'active' : '', onclick: () => i !== current && app.run('history.selectState', { state: i }) }, h('span.history-index', String(i + 1)), h('span', label));
    list.append(row);
  });
  queueMicrotask(() => (list.lastElementChild as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest' }));
  return h('div.history',
    list,
    h('div.layer-actions',
      h('button.ghost-btn', { disabled: !doc.canUndo, onclick: () => app.undo() }, icon(ICONS.undo, 15), t('Undo')),
      h('button.ghost-btn', { disabled: !doc.canRedo, onclick: () => app.redo() }, icon(ICONS.redo, 15), t('Redo'))),
  );
}

export { findLayer };
