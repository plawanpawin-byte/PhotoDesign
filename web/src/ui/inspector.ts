// The inspector: one card on the right with three views — Layers, Adjust and History.
import type { App } from '../app';
import { findLayer } from '../app';
import type { LayerInfo } from '../engine/types';
import { clear, h, icon } from './dom';
import { ICONS } from './icons';

type Tab = 'layers' | 'adjust' | 'history';

const BLENDS = ['Normal', 'Dissolve', 'Darken', 'Multiply', 'Color Burn', 'Linear Burn', 'Lighten', 'Screen', 'Color Dodge', 'Linear Dodge (Add)', 'Overlay', 'Soft Light', 'Hard Light', 'Vivid Light', 'Linear Light', 'Pin Light', 'Hard Mix', 'Difference', 'Exclusion', 'Subtract', 'Divide', 'Hue', 'Saturation', 'Color', 'Luminosity'];

export function inspector(app: App): HTMLElement {
  let tab: Tab = 'layers';
  const body = h('div.inspector-body');
  const tabs = (['layers', 'adjust', 'history'] as const).map((t) =>
    h('button.seg', { role: 'tab', dataset: { tab: t }, onclick: () => { tab = t; render(); } },
      icon(t === 'layers' ? ICONS.layers : t === 'adjust' ? ICONS.sliders : ICONS.clock, 15),
      t === 'layers' ? 'Layers' : t === 'adjust' ? 'Adjust' : 'History'));
  const render = () => {
    for (const b of tabs) b.classList.toggle('active', b.dataset.tab === tab);
    clear(body);
    if (!app.doc) {
      body.append(h('p.empty-note', 'Open or create a document to see its layers, adjustments and history.'));
      return;
    }
    body.append(tab === 'layers' ? layersView(app) : tab === 'adjust' ? adjustView(app) : historyView(app));
  };
  app.on('state', () => {
    // Keep slider positions while adjusting: the Adjust view rebuilds only on tab or document change.
    if (tab !== 'adjust' || !body.querySelector('.adjust')) render();
  });
  render();
  return h('aside.inspector', h('div.segmented', { role: 'tablist' }, tabs), body);
}

function layersView(app: App): HTMLElement {
  const doc = app.doc!;
  const active = app.activeLayer();
  const list = h('ul.layer-list', { role: 'listbox', 'aria-label': 'Layers' });
  const addRows = (layers: LayerInfo[], depth: number) => {
    for (const l of layers) {
      const eye = h('button.layer-eye', { title: l.visible ? 'Hide' : 'Show', onclick: (e: MouseEvent) => { e.stopPropagation(); app.run('layer.setProps', { layer: l.id, visible: !l.visible }); } }, icon(l.visible ? ICONS.eye : ICONS.eyeOff, 15));
      const name = h('span.layer-name', l.name);
      name.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const next = window.prompt('Layer name', l.name);
        if (next && next.trim() && next !== l.name) app.run('layer.setProps', { layer: l.id, name: next.trim() });
      });
      const row = h('li.layer-row', { role: 'option', 'aria-selected': String(l.id === doc.activeLayer), class: [l.id === doc.activeLayer ? 'active' : '', l.visible ? '' : 'hidden-layer'].join(' '), style: { paddingLeft: `${8 + depth * 14}px` }, title: `${l.kind} layer — double-click the name to rename` },
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
    props.append(h('div.prop-row', h('span.prop-label', 'Blend'), blend), h('div.prop-row', h('span.prop-label', 'Opacity'), opacity, out));
  }
  const actions = h('div.layer-actions',
    h('button.icon-btn', { title: 'New layer', onclick: () => app.run('layer.new.layer', {}) }, icon(ICONS.plus, 16)),
    h('button.icon-btn', { title: 'Duplicate layer', disabled: !active, onclick: () => app.run('layer.duplicate', {}) }, icon(ICONS.copy, 16)),
    h('button.icon-btn', { title: 'Merge down', disabled: !active, onclick: () => app.run('layer.mergeDown', {}) }, h('span.txt-icon', '⤓')),
    h('div.flex'),
    h('button.icon-btn.danger', { title: 'Delete layer', disabled: !active, onclick: () => app.run('layer.delete', {}) }, icon(ICONS.trash, 16)),
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
];

const QUICK: readonly [string, string][] = [
  ['image.autoTone', 'Auto tone'],
  ['image.autoContrast', 'Auto contrast'],
  ['image.autoColor', 'Auto colour'],
  ['image.adjustments.desaturate', 'Black & white'],
  ['image.adjustments.invert', 'Invert'],
];

function adjustView(app: App): HTMLElement {
  const quick = h('div.quick-row', QUICK.map(([id, label]) => h('button.chip-btn', { onclick: () => app.run(id) }, label)));
  const cards = ADJUST_GROUPS.map((g) => {
    const values: Record<string, number> = {};
    const rows = g.controls.map((c) => {
      values[c.key] = c.value;
      const input = h('input', { type: 'range', min: c.min, max: c.max, step: c.step, value: String(c.value), 'aria-label': c.label }) as HTMLInputElement;
      const out = h('output', String(c.value));
      input.addEventListener('input', () => {
        values[c.key] = Number(input.value);
        out.textContent = input.value;
      });
      input.addEventListener('dblclick', () => {
        input.value = String(c.value);
        values[c.key] = c.value;
        out.textContent = String(c.value);
      });
      return h('div.prop-row', h('span.prop-label', c.label), input, out);
    });
    return h('details.adjust-card', { open: g.title === 'Light' },
      h('summary', h('span.adjust-title', g.title), h('span.adjust-note', g.note), icon(ICONS.chevron, 14)),
      rows,
      h('div.adjust-actions', h('button.primary-btn.small', { onclick: () => app.run(g.command, { ...values }) }, 'Apply to layer')),
    );
  });
  return h('div.adjust', h('p.section-label', icon(ICONS.sparkle, 13), 'One click'), quick, h('p.section-label', 'Fine tune'), cards, h('p.foot-note', 'Changes apply to the selected layer and can be undone.'));
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
      h('button.ghost-btn', { disabled: !doc.canUndo, onclick: () => app.undo() }, icon(ICONS.undo, 15), 'Undo'),
      h('button.ghost-btn', { disabled: !doc.canRedo, onclick: () => app.redo() }, icon(ICONS.redo, 15), 'Redo')),
  );
}

export { findLayer };
