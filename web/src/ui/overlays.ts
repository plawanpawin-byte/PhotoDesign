// Things that appear over the workspace: the start screen, New document, the action finder and
// the menu.
import type { App, NewDocumentSpec } from '../app';
import type { CommandInfo } from '../engine/types';
import { rank } from '../lib/fuzzy';
import { t } from '../lib/i18n';
import { buildMenuTree, type MenuNode } from '../lib/menu-tree';
import { clear, h, icon } from './dom';
import { ICONS } from './icons';

export interface Preset {
  name: string;
  width: number;
  height: number;
  note: string;
  resolution?: number;
}

export const PRESETS: readonly Preset[] = [
  { name: 'Square', width: 2048, height: 2048, note: 'Social post' },
  { name: 'Full HD', width: 1920, height: 1080, note: 'Screen, 16:9' },
  { name: 'Story', width: 1080, height: 1920, note: 'Phone, 9:16' },
  { name: '4K', width: 3840, height: 2160, note: 'UHD screen' },
  { name: 'A4 print', width: 2480, height: 3508, note: '300 ppi', resolution: 300 },
  { name: 'Photo 3:2', width: 6000, height: 4000, note: '24 MP' },
];

export function welcome(app: App, openPicker: () => void, openNew: () => void): HTMLElement {
  const el = h('section.welcome');
  const render = () => {
    el.hidden = !!app.doc;
  };
  const cards = PRESETS.map((p) => {
    const ratio = p.width / p.height;
    const shape = h('span.preset-shape', { style: { aspectRatio: String(ratio), [ratio >= 1 ? 'width' : 'height']: '44px' } });
    return h('button.preset', { onclick: () => app.newDocument({ width: p.width, height: p.height, name: p.name, resolution: p.resolution ?? 72 }) },
      h('span.preset-frame', shape), h('span.preset-name', t(p.name)), h('span.preset-size', `${p.width} × ${p.height}`), h('span.preset-note', t(p.note)));
  });
  el.append(
    h('div.welcome-card',
      h('div.welcome-head', icon(ICONS.logo, 34), h('div', h('h1', 'Photo', h('b', 'Design')), h('p', t('Edit photos, paint and compose — free and open source.')))),
      h('div.welcome-actions',
        h('button.primary-btn.large', { onclick: openPicker }, icon(ICONS.open, 18), t('Open an image')),
        h('button.ghost-btn.large', { onclick: openNew }, icon(ICONS.plus, 18), t('Custom size…'))),
      h('p.section-label', t('Start blank')),
      h('div.preset-grid', cards),
      h('div.drop-hint', icon(ICONS.image, 16), t('Or drop a PNG, JPEG, WebP, TIFF, PSD or camera raw file anywhere.')),
    ),
  );
  app.on('state', render);
  render();
  return el;
}

function modal(onClose: () => void, ...children: Node[]): HTMLElement {
  const backdrop = h('div.backdrop', { onclick: (e: MouseEvent) => e.target === backdrop && onClose() }, ...children);
  backdrop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  });
  return backdrop;
}

export function newDocumentDialog(app: App, close: () => void): HTMLElement {
  const num = (label: string, value: number, min: number, max: number) => {
    const input = h('input', { type: 'number', min, max, value: String(value), 'aria-label': label }) as HTMLInputElement;
    return { input, row: h('label.field', h('span', label), input) };
  };
  const name = h('input', { type: 'text', value: 'Untitled', 'aria-label': t('Name') }) as HTMLInputElement;
  const w = num(t('Width (px)'), 1920, 1, 300000);
  const ht = num(t('Height (px)'), 1080, 1, 300000);
  const res = num(t('Resolution (ppi)'), 72, 1, 30000);
  const bg = h('select', { 'aria-label': t('Background') }, h('option', { value: 'white' }, t('White')), h('option', { value: 'black' }, t('Black')), h('option', { value: 'transparent' }, t('Transparent'))) as HTMLSelectElement;
  const error = h('p.form-error');
  const create = () => {
    const spec: NewDocumentSpec = { name: name.value.trim() || 'Untitled', width: Math.round(Number(w.input.value)), height: Math.round(Number(ht.input.value)), resolution: Number(res.input.value), background: bg.value as NewDocumentSpec['background'] };
    if (!(spec.width >= 1 && spec.height >= 1 && spec.width <= 300000 && spec.height <= 300000)) {
      error.textContent = t('Width and height must be between 1 and 300,000 pixels.');
      return;
    }
    close();
    app.newDocument(spec);
  };
  const form = h('form.dialog', { onsubmit: (e: Event) => { e.preventDefault(); create(); } },
    h('h2', t('New document')),
    h('label.field', h('span', t('Name')), name),
    h('div.field-row', w.row, ht.row),
    h('div.field-row', res.row, h('label.field', h('span', t('Background')), bg)),
    error,
    h('div.dialog-actions', h('button.ghost-btn', { type: 'button', onclick: close }, t('Cancel')), h('button.primary-btn', { type: 'submit' }, t('Create'))),
  );
  const el = modal(close, form);
  queueMicrotask(() => name.select());
  return el;
}

/** Search every engine command by name, menu or id, and run it. */
export function commandPalette(app: App, close: () => void): HTMLElement {
  const input = h('input.palette-input', { type: 'search', placeholder: t('Find an action — try “blur”, “rotate”, “new layer”'), 'aria-label': t('Find an action…') }) as HTMLInputElement;
  const list = h('ul.palette-list', { role: 'listbox' });
  const commands = app.commands();
  let results: CommandInfo[] = [];
  let index = 0;
  const label = (c: CommandInfo) => `${c.label} ${c.menu.join(' ')} ${c.id}`;
  const run = (c: CommandInfo | undefined) => {
    if (!c) return;
    close();
    if (!c.enabled) {
      app.notify(c.disabledReason ? `${c.label.replace('…', '')}: ${c.disabledReason}` : `${c.label} ${t('is not available right now')}`, 'error');
      return;
    }
    if (app.run(c.id) !== undefined) app.notify(`${c.label.replace('…', '')} ${t('done')}`);
  };
  const render = () => {
    const q = input.value;
    results = q.trim() ? rank(commands, q, label, 60).map((m) => m.item) : commands.filter((c) => c.menu.length && c.enabled).slice(0, 60);
    index = Math.min(index, Math.max(0, results.length - 1));
    clear(list);
    results.forEach((c, i) => {
      const row = h('li.palette-row', { role: 'option', class: [i === index ? 'active' : '', c.enabled ? '' : 'disabled'].join(' '), 'aria-selected': String(i === index), onclick: () => run(c), onmousemove: () => { if (index !== i) { index = i; mark(); } } },
        h('span.palette-label', c.label),
        h('span.palette-path', c.menu.join(' › ') || c.id),
        c.shortcut ? h('kbd', c.shortcut.replace('Cmd', 'Ctrl')) : null);
      list.append(row);
    });
    if (!results.length) list.append(h('li.palette-empty', t('No matching action')));
  };
  const mark = () => {
    [...list.children].forEach((el, i) => el.classList.toggle('active', i === index));
    (list.children[index] as HTMLElement | undefined)?.scrollIntoView?.({ block: 'nearest' });
  };
  input.addEventListener('input', () => {
    index = 0;
    render();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { index = Math.min(results.length - 1, index + 1); mark(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { index = Math.max(0, index - 1); mark(); e.preventDefault(); }
    else if (e.key === 'Enter') { run(results[index]); e.preventDefault(); }
  });
  render();
  const el = modal(close, h('div.palette', h('div.palette-head', icon(ICONS.search, 16), input, h('kbd', 'Esc')), list, h('div.palette-foot', `${commands.length} ${t('actions from the engine · ↑↓ to move · Enter to run')}`)));
  queueMicrotask(() => input.focus());
  return el;
}

/** Every menu the engine defines, as a two-column popover: menus on the left, items on the right. */
export function menuPopover(app: App, anchor: HTMLElement, close: () => void): HTMLElement {
  const tree = buildMenuTree(app.commands());
  const left = h('ul.menu-groups');
  const right = h('div.menu-items');
  let current: MenuNode | undefined = tree[0];
  const showNode = (node: MenuNode) => {
    current = node;
    [...left.children].forEach((el) => el.classList.toggle('active', (el as HTMLElement).dataset.name === node.name));
    clear(right);
    const section = (n: MenuNode, depth: number) => {
      if (depth > 0) right.append(h('p.menu-sub', n.name));
      for (const c of n.commands)
        right.append(h('button.menu-item', { disabled: !c.enabled, title: c.disabledReason ?? c.id, onclick: () => { close(); app.run(c.id); } }, h('span', c.label), c.shortcut ? h('span.menu-hint', c.shortcut.replace('Cmd', 'Ctrl')) : null));
      for (const child of n.children) section(child, depth + 1);
    };
    section(node, 0);
  };
  for (const node of tree) {
    left.append(h('li', { dataset: { name: node.name }, onmouseenter: () => showNode(node), onclick: () => showNode(node) }, node.name, icon(ICONS.chevron, 13)));
  }
  if (current) showNode(current);
  const r = anchor.getBoundingClientRect();
  const pop = h('div.menu-pop', { style: { left: `${r.left}px`, top: `${r.bottom + 6}px` } }, left, right);
  return modal(close, pop);
}
