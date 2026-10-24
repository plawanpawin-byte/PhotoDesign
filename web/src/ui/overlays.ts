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
      h('div.welcome-head', h('img.welcome-logo', { src: './logo-256.png', alt: '', width: 64, height: 64 }), h('div', h('h1', 'Photo', h('b', 'Design')), h('p', t('Edit photos, paint and compose — free and open source.')))),
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

/** Where the desktop host's control channel and MCP server are; null in a plain browser tab. */
export interface AgentInfo {
  port: number;
  tokenFile: string;
  root: string;
  cli: string;
  cliFound: boolean;
}

/** One PowerShell line that connects Claude Code, Codex and Antigravity for the installed Windows app. */
export const INSTALL_COMMAND =
  '$exe = (Get-ChildItem "$env:LOCALAPPDATA\\Programs" -Filter "PhotoDesign.exe" -Recurse -EA 0 | Select-Object -First 1).FullName; & $exe --install-mcp';

/** The MCP server's configuration for AI clients, ready to copy. */
export function agentConfigs(info: AgentInfo): { name: string; text: string }[] {
  const args = ['mcp', '--bridge', `127.0.0.1:${info.port}`, '--control-token-file', info.tokenFile];
  const json = JSON.stringify({ mcpServers: { photodesign: { command: info.cli, args } } }, null, 2);
  const quote = (s: string) => (/[\s"]/.test(s) ? JSON.stringify(s) : s);
  return [
    { name: 'Claude Desktop / Cursor / Antigravity (JSON)', text: json },
    { name: 'Claude Code', text: `claude mcp add photodesign -- ${[info.cli, ...args].map(quote).join(' ')}` },
    { name: 'Codex (~/.codex/config.toml)', text: `[mcp_servers.photodesign]\ncommand = ${JSON.stringify(info.cli)}\nargs = ${JSON.stringify(args)}` },
  ];
}

export function agentsDialog(info: AgentInfo | null, close: () => void): HTMLElement {
  const body = info
    ? [
        h('p', t('AI agents connect through MCP and use the same tools as you, in this window. Files they open and save stay in:')),
        h('code.agent-path', info.root),
        info.cliFound ? null : h('p.form-error', `${t('MCP server not built yet. Run in the desktop folder:')} npm run cli`),
        ...[{ name: t('Windows: one command (PowerShell)'), text: INSTALL_COMMAND }, ...agentConfigs(info)].map(({ name, text }) => {
          const pre = h('pre.agent-config', text);
          const copy = h('button.ghost-btn', { type: 'button', onclick: () => void navigator.clipboard?.writeText(text).then(() => (copy.textContent = t('Copied'))) }, t('Copy'));
          return h('div.agent-block', h('div.agent-head', h('b', name), copy), pre);
        }),
      ]
    : [h('p', t('Agents connect to the desktop app. Open PhotoDesign with npm start in the desktop folder, or the installed app.'))];
  return modal(close, h('div.dialog.agents-dialog', h('h2', t('Connect AI agents (MCP)')), ...body, h('div.dialog-actions', h('button.primary-btn', { type: 'button', onclick: close }, t('Done')))));
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

/** The panels a Window menu can bring forward: group tab ids and their names. */
const PANELS: readonly [string, string][] = [['color', 'Color'], ['swatches', 'Swatches'], ['image', 'Properties'], ['adjust', 'Adjustments'], ['history', 'History'], ['layers', 'Layers']];

/** Menus the interface owns rather than the engine: Window shows panels, Help points at the shortcuts. */
export const CLIENT_MENUS = ['Window', 'Help'] as const;

function clientMenu(app: App, name: string): MenuNode | undefined {
  const item = (id: string, label: string, run: () => void, shortcut?: string) => ({ id, label: t(label), menu: [name], params: '{}', enabled: true, shortcut, run });
  const entries =
    name === 'Window' ? PANELS.map(([tab, label]) => item(`window.${tab}`, label, () => document.querySelector<HTMLButtonElement>(`.seg[data-tab="${tab}"]`)?.click()))
    : name === 'Help' ? [
      item('help.actions', 'Find an action…', () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })), 'Ctrl+K'),
      item('help.agents', 'Connect AI agents (MCP)…', () => document.dispatchEvent(new CustomEvent('photodesign:agents'))),
      item('help.about', 'About PhotoDesign', () => app.notify(t('PhotoDesign — free and open source photo editor. Engine in Rust, interface in TypeScript.'))),
    ]
    : null;
  if (!entries) return undefined;
  clientRuns.clear();
  for (const e of entries) clientRuns.set(e.id, e.run);
  return { name, children: [], commands: entries.map(({ run: _run, ...c }) => c as unknown as CommandInfo) };
}
const clientRuns = new Map<string, () => void>();

/** One menu-bar menu as a drop-down; submenus open to the side on hover. */
export function menuDropdown(app: App, name: string, anchor: HTMLElement, close: () => void): HTMLElement {
  const node = buildMenuTree(app.commands()).find((n) => n.name === name) ?? clientMenu(app, name);
  const list = (n: MenuNode): HTMLElement => {
    const el = h('div.menu-list', { role: 'menu' });
    for (const c of n.commands)
      el.append(h('button.menu-item', { role: 'menuitem', disabled: !c.enabled, title: c.disabledReason ?? '', onclick: () => { close(); const own = clientRuns.get(c.id); if (own) own(); else app.run(c.id); } }, h('span', c.label), c.shortcut ? h('span.menu-hint', c.shortcut.replace('Cmd', 'Ctrl')) : null));
    if (n.commands.length && n.children.length) el.append(h('div.menu-sep'));
    for (const child of n.children)
      el.append(h('div.menu-sub-row', h('div.menu-item.has-sub', h('span', t(child.name)), icon(ICONS.chevron, 12)), h('div.menu-fly', list(child))));
    if (!n.commands.length && !n.children.length) el.append(h('div.menu-empty', t('Nothing here yet')));
    return el;
  };
  const r = anchor.getBoundingClientRect();
  const drop = h('div.menu-drop', { dataset: { menu: name }, style: { left: `${r.left}px`, top: `${r.bottom}px` } }, node ? list(node) : null);
  return modal(close, drop);
}
