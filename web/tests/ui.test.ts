import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/app';
import { mount } from '../src/main';
import { setLang } from '../src/lib/i18n';
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
    key('keydown', 'f');
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
    root.querySelector<HTMLButtonElement>('.seg[data-tab="layers"]')!.click();
    expect(root.querySelectorAll('.layer-row')).toHaveLength(1);
    root.querySelector<HTMLButtonElement>('.seg[data-tab="history"]')!.click();
    expect(root.querySelector('.history-row.active')?.textContent).toContain('New');
    root.querySelector<HTMLButtonElement>('.seg[data-tab="adjust"]')!.click();
    expect(root.querySelectorAll('.adjust-card').length).toBeGreaterThan(3);
  });

  it('layer buttons run layer commands', () => {
    const { root, engine, app } = setup();
    app.newDocument({ width: 20, height: 20 });
    root.querySelector<HTMLButtonElement>('.seg[data-tab="layers"]')!.click();
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

  describe('tools that build shapes', () => {
    const drag = (root: HTMLElement, from: [number, number], to: [number, number]) => {
      const canvas = root.querySelector<HTMLCanvasElement>('.stage-canvas')!;
      const fire = (type: string, x: number, y: number, buttons: number) => canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, buttons, bubbles: true }));
      fire('pointerdown', from[0], from[1], 1);
      fire('pointermove', (from[0] + to[0]) / 2, (from[1] + to[1]) / 2, 1);
      fire('pointermove', to[0], to[1], 1);
      fire('pointerup', to[0], to[1], 0);
    };
    const doc = () => {
      const s = setup();
      s.app.newDocument({ width: 200, height: 100 });
      s.app.setView({ zoom: 1, x: 0, y: 0 });
      s.root.querySelector<HTMLButtonElement>('.seg[data-tab="layers"]')!.click();
      return s;
    };

    it('the marquee turns a drag into a rectangular selection with the chosen mode', () => {
      const { root, engine, app } = doc();
      key('keydown', 'm');
      app.setSelect({ mode: 'add', feather: 3 });
      drag(root, [10, 20], [110, 70]);
      expect(engine.calls.at(-1)).toEqual(['select.rect', { x: 10, y: 20, width: 100, height: 50, ellipse: false, mode: 'add', feather: 3 }]);
    });

    it('the ellipse tool and a drag outside the document stay within it', () => {
      const { root, engine } = doc();
      key('keydown', 'o');
      drag(root, [150, 50], [400, 300]);
      expect(engine.calls.at(-1)).toEqual(['select.rect', { x: 150, y: 50, width: 50, height: 50, ellipse: true, mode: 'replace', feather: 0 }]);
    });

    it('the magic wand and the gradient run their commands', () => {
      const { root, engine, app } = doc();
      key('keydown', 'w');
      drag(root, [30, 30], [30, 30]);
      expect(engine.calls.at(-1)?.[0]).toBe('select.magicWand');
      expect(engine.calls.at(-1)?.[1]).toMatchObject({ x: 30, y: 30, tolerance: 32 });
      key('keydown', 'g');
      app.setGradientStyle('radial');
      drag(root, [0, 0], [100, 0]);
      expect(engine.calls.at(-1)).toEqual(['paint.gradient', { from: [0, 0], to: [100, 0], style: 'radial', colors: ['#000000', '#ffffff'] }]);
    });

    it('the crop is drawn first and only applied on request', () => {
      const { root, engine, app } = doc();
      key('keydown', 'c');
      drag(root, [20, 10], [120, 60]);
      expect(engine.calls.some(([id]) => id === 'image.crop')).toBe(false);
      expect(app.cropRect).toEqual({ x: 20, y: 10, width: 100, height: 50 });
      root.querySelector<HTMLButtonElement>('.tool-options .primary-btn')!.click();
      expect(engine.calls.at(-1)).toEqual(['image.crop', { x: 20, y: 10, width: 100, height: 50 }]);
      expect(app.cropRect).toBeNull();
    });

    it('the Image tab runs transforms and selection commands', () => {
      const { root, engine } = doc();
      root.querySelector<HTMLButtonElement>('.seg[data-tab="image"]')!.click();
      const tile = (label: string) => [...root.querySelectorAll<HTMLButtonElement>('.tile-btn')].find((b) => b.textContent === label)!;
      tile('Rotate right').click();
      expect(engine.calls.at(-1)?.[0]).toBe('image.imageRotation.90cw');
      expect(tile('Deselect').disabled).toBe(true);
      expect(tile('Select all').disabled).toBe(false);
    });
  });

  it('switching to Thai rebuilds the interface and keeps the document', () => {
    const { root, app } = setup();
    app.newDocument({ width: 20, height: 20, name: 'Keep me' });
    expect(root.querySelector('.search-btn')?.textContent).toContain('Find an action');
    setLang('th');
    try {
      // main.ts rebuilds on language change; here we do the same by hand.
      app.detachUi();
      root.replaceChildren();
      mount(root, app);
      app.refresh();
      expect(root.querySelector('.search-btn')?.textContent).toContain('ค้นหาคำสั่ง');
      expect(root.querySelector('.doc-tab.active')?.textContent).toContain('Keep me');
      expect(root.querySelector('.tool[data-tool="brush"]')?.getAttribute('aria-label')).toBe('พู่กัน');
    } finally {
      setLang('en');
    }
  });
});
