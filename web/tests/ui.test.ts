import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/app';
import { mount } from '../src/main';
import { FakeEngine } from './fake-engine';

function setup() {
  document.body.innerHTML = '<div id="root"></div>';
  const root = document.getElementById('root')!;
  const engine = new FakeEngine();
  const app = new App(engine);
  mount(root, app);
  return { root, engine, app };
}

const key = (type: 'keydown' | 'keyup', k: string, extra: KeyboardEventInit = {}) => window.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, ...extra }));

describe('interface', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('starts on the welcome screen and a preset creates a document', () => {
    const { root, engine } = setup();
    const welcome = root.querySelector<HTMLElement>('.welcome')!;
    expect(welcome.hidden).toBe(false);
    expect(root.querySelectorAll('.preset')).toHaveLength(6);
    root.querySelector<HTMLButtonElement>('.preset')!.click();
    expect(engine.calls[0]?.[0]).toBe('file.new');
    expect(welcome.hidden).toBe(true);
    expect(root.querySelector('.doc-tab.active')?.textContent).toContain('Square');
  });

  it('shows exactly one active tool, and Space swaps it rather than adding one', () => {
    const { root, app } = setup();
    const active = () => [...root.querySelectorAll<HTMLElement>('.tool.active')].map((b) => b.dataset.tool);
    expect(active()).toEqual(['brush']);
    key('keydown', ' ');
    expect(active()).toEqual(['hand']);
    expect(root.querySelector('.tool.held')).not.toBeNull();
    expect(root.querySelector('.opt-held')?.textContent).toBe('held');
    key('keyup', ' ');
    expect(active()).toEqual(['brush']);
    key('keydown', 'g');
    expect(app.tools.selected).toBe('fill');
    expect(active()).toEqual(['fill']);
    expect(root.querySelector('.tool-options')?.textContent).toContain('Tolerance');
  });

  it('the action finder searches engine commands and runs one', () => {
    const { root, engine, app } = setup();
    app.newDocument({ width: 20, height: 20 });
    key('keydown', 'k', { ctrlKey: true });
    const input = root.querySelector<HTMLInputElement>('.palette-input')!;
    expect(input).not.toBeNull();
    input.value = 'invert';
    input.dispatchEvent(new Event('input'));
    const rows = root.querySelectorAll('.palette-row');
    expect(rows[0]?.textContent).toContain('Invert');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(engine.calls.at(-1)?.[0]).toBe('image.adjustments.invert');
    expect(root.querySelector('.palette')).toBeNull();
  });

  it('the menu lists engine menus and the inspector switches views', () => {
    const { root, app } = setup();
    app.newDocument({ width: 20, height: 20 });
    root.querySelector<HTMLButtonElement>('.topbar .ghost-btn')!.click();
    const groups = [...root.querySelectorAll('.menu-groups li')].map((l) => l.textContent);
    expect(groups).toEqual(['File', 'Image', 'Filter']);
    key('keydown', 'Escape');
    expect(root.querySelector('.menu-pop')).toBeNull();
    expect(root.querySelectorAll('.layer-row')).toHaveLength(1);
    root.querySelector<HTMLButtonElement>('.seg[data-tab="history"]')!.click();
    expect(root.querySelector('.history-row.active')?.textContent).toContain('New');
    root.querySelector<HTMLButtonElement>('.seg[data-tab="adjust"]')!.click();
    expect(root.querySelectorAll('.adjust-card').length).toBeGreaterThan(3);
  });

  it('layer buttons run layer commands', () => {
    const { root, engine, app } = setup();
    app.newDocument({ width: 20, height: 20 });
    root.querySelector<HTMLButtonElement>('.layer-actions .icon-btn[title="New layer"]')!.click();
    expect(engine.calls.at(-1)?.[0]).toBe('layer.new.layer');
    expect(root.querySelectorAll('.layer-row')).toHaveLength(2);
    root.querySelector<HTMLButtonElement>('.layer-eye')!.click();
    expect(engine.calls.at(-1)).toEqual(['layer.setProps', { layer: 2, visible: false }]);
  });

  it('shortcuts stay out of text fields', () => {
    const { root, app } = setup();
    root.querySelector<HTMLButtonElement>('.doc-tab.add')!.click();
    const name = root.querySelector<HTMLInputElement>('.dialog input[type="text"]')!;
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
    expect(app.tools.selected).toBe('brush');
  });
});
