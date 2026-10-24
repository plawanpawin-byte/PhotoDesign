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
    key('keydown', 'g');
    key('keydown', 'G', { shiftKey: true });
    expect(app.tools.selected).toBe('fill');
    expect(active()).toEqual(['fill']);
    expect(root.querySelector('.tool-options')?.textContent).toContain('Tolerance');
  });

  it('zoom lives in the status bar and takes a typed percentage', () => {
    const { root, app } = setup();
    app.newDocument({ width: 200, height: 100 });
    const input = root.querySelector<HTMLInputElement>('.status .zoom-input')!;
    input.value = '200';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(app.view.zoom).toBe(2);
    expect(input.value).toBe('200%');
  });

  it('the colour panel and swatches set the foreground colour', () => {
    const { root, engine } = setup();
    const hex = root.querySelector<HTMLInputElement>('.hex-input')!;
    hex.value = '#ff8800';
    hex.dispatchEvent(new Event('change'));
    expect(engine.calls.at(-1)).toEqual(['tools.setColors', { foreground: '#ff8800' }]);
    root.querySelector<HTMLButtonElement>('.seg[data-tab="swatches"]')!.click();
    root.querySelectorAll<HTMLButtonElement>('.swatch')[4]!.click();
    expect(engine.calls.at(-1)).toEqual(['tools.setColors', { foreground: '#ff0000' }]);
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

  it('the menu bar lists engine menus, opens one as a drop-down and the panels switch views', () => {
    const { root, app, engine } = setup();
    app.newDocument({ width: 20, height: 20 });
    const items = [...root.querySelectorAll<HTMLButtonElement>('.menubar-item')];
    expect(items.map((b) => b.textContent)).toEqual(['File', 'Image', 'Filter', 'Window', 'Help']);
    items[1]!.click();
    const drop = root.querySelector('.menu-drop')!;
    expect(drop.querySelector('.menu-item.has-sub')?.textContent).toBe('Adjustments');
    drop.querySelector<HTMLButtonElement>('.menu-fly button.menu-item')!.click();
    expect(engine.calls.at(-1)?.[0]).toBe('image.adjustments.invert');
    expect(root.querySelector('.menu-drop')).toBeNull();
    items[0]!.click();
    items[2]!.dispatchEvent(new MouseEvent('mouseenter'));
    expect(root.querySelector<HTMLElement>('.menu-drop')?.dataset.menu).toBe('Filter');
    key('keydown', 'Escape');
    expect(root.querySelector('.menu-drop')).toBeNull();
    expect(root.querySelectorAll('.panel-group')).toHaveLength(3);
    items[3]!.click();
    [...root.querySelectorAll<HTMLButtonElement>('.menu-drop .menu-item')].find((b) => b.textContent === 'History')!.click();
    expect(root.querySelector('.panel-group[data-group="middle"] .seg.active')?.textContent).toBe('History');
    expect(root.querySelector('.panel-group[data-group="bottom"] .seg.active')?.textContent).toBe('Layers');
    root.querySelector<HTMLButtonElement>('.seg[data-tab="layers"]')!.click();
    expect(root.querySelectorAll('.layer-row')).toHaveLength(1);
    root.querySelector<HTMLButtonElement>('.seg[data-tab="history"]')!.click();
    expect(root.querySelector('.history-row.active')?.textContent).toContain('image.adjustments.invert');
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
      const { root, engine, app } = doc();
      app.tools.select('ellipse');
      drag(root, [150, 50], [400, 300]);
      expect(engine.calls.at(-1)).toEqual(['select.rect', { x: 150, y: 50, width: 50, height: 50, ellipse: true, mode: 'replace', feather: 0 }]);
    });

    it('the magic wand and the gradient run their commands', () => {
      const { root, engine, app } = doc();
      app.tools.select('wand');
      drag(root, [30, 30], [30, 30]);
      expect(engine.calls.at(-1)?.[0]).toBe('select.magicWand');
      expect(engine.calls.at(-1)?.[1]).toMatchObject({ x: 30, y: 30, tolerance: 32 });
      app.tools.select('gradient');
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

  it('every tool slot shows one tool and right-click opens the others in it', () => {
    const { root, app } = setup();
    const slots = root.querySelectorAll<HTMLButtonElement>('.tool-dock .tool');
    expect(slots.length).toBeLessThan(25);
    const dodge = root.querySelector<HTMLButtonElement>('.tool[data-tool="dodge"]')!;
    dodge.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    const items = [...document.querySelectorAll<HTMLButtonElement>('.tool-fly-item')].map((b) => b.dataset.tool);
    expect(items).toEqual(['dodge', 'burn', 'sponge']);
    document.querySelector<HTMLButtonElement>('.tool-fly-item[data-tool="burn"]')!.click();
    expect(app.tools.selected).toBe('burn');
    expect(root.querySelector('.tool[data-tool="burn"]')?.classList.contains('active')).toBe(true);
    expect(root.querySelector('.tool[data-tool="dodge"]')).toBeNull();
    expect(root.querySelector('.tool-options')?.textContent).toContain('Exposure');
  });

  it('retouching, shape and clone tools send the engine commands', () => {
    const { root, engine, app } = setup();
    app.newDocument({ width: 200, height: 100 });
    app.setView({ zoom: 1, x: 0, y: 0 });
    const canvas = root.querySelector<HTMLCanvasElement>('.stage-canvas')!;
    const fire = (type: string, x: number, y: number, buttons: number, extra: MouseEventInit = {}) => canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, buttons, bubbles: true, ...extra }));
    const drag = (a: [number, number], b: [number, number]) => { fire('pointerdown', a[0], a[1], 1); fire('pointermove', b[0], b[1], 1); fire('pointerup', b[0], b[1], 0); };
    app.tools.select('smudge');
    drag([10, 10], [40, 20]);
    expect(engine.calls.at(-1)?.[0]).toBe('paint.smudge');
    expect(engine.calls.at(-1)?.[1]).toMatchObject({ strength: 50, size: 24 });
    app.tools.select('rectShape');
    drag([10, 10], [60, 50]);
    expect(engine.calls.at(-1)).toEqual(['shape.create', { kind: 'rect', rect: [10, 10, 50, 40], fill: '#000000' }]);
    app.tools.select('move');
    drag([10, 10], [25, 5]);
    expect(engine.calls.at(-1)).toEqual(['layer.translate', { dx: 15, dy: -5 }]);
    app.tools.select('cloneStamp');
    const before = engine.calls.length;
    drag([50, 50], [60, 50]);
    expect(engine.calls.length).toBe(before);
    fire('pointerdown', 5, 5, 1, { altKey: true });
    fire('pointerup', 5, 5, 0);
    drag([50, 50], [60, 50]);
    expect(engine.calls.at(-1)?.[0]).toBe('paint.cloneStamp');
    expect(engine.calls.at(-1)?.[1]).toMatchObject({ source: [5, 5], aligned: true });
    drag([80, 50], [90, 50]);
    expect(engine.calls.at(-1)?.[1]).toMatchObject({ offset: [-45, -45] });
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
