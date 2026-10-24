import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/app';
import { handleControl } from '../src/control';
import { mount } from '../src/main';
import { addKnot, commitCall, dragLastHandle, hitsFirst, removeLastKnot, segments, toEnginePath, type PenPath } from '../src/tools/pen';
import { FakeEngine } from './fake-engine';

const at = (x: number, y: number) => ({ x, y });
const triangle = (): PenPath => [at(10, 10), at(90, 10), at(50, 80)].reduce<PenPath | null>((p, q) => addKnot(p, q), null)!;

describe('pen path', () => {
  it('adds corner anchors in order', () => {
    expect(triangle().knots.map((k) => [k.anchor.x, k.anchor.y])).toEqual([[10, 10], [90, 10], [50, 80]]);
    expect(triangle().knots.every((k) => !k.in && !k.out)).toBe(true);
  });

  it('a drag pulls out an outgoing handle and mirrors the incoming one', () => {
    const p = dragLastHandle(triangle(), at(70, 100));
    const k = p.knots[2]!;
    expect(k.out).toEqual({ x: 70, y: 100 });
    expect(k.in).toEqual({ x: 30, y: 60 });
    expect(p.knots[0]!.out).toBeUndefined();
  });

  it('a drag that barely moves keeps the anchor a corner, and dragging back removes the handles', () => {
    expect(dragLastHandle(triangle(), at(51, 80)).knots[2]).toEqual({ anchor: at(50, 80) });
    const curved = dragLastHandle(triangle(), at(70, 100));
    expect(dragLastHandle(curved, at(50, 80)).knots[2]).toEqual({ anchor: at(50, 80) });
  });

  it('removes the last anchor, and everything with the only one', () => {
    expect(removeLastKnot(triangle())!.knots).toHaveLength(2);
    expect(removeLastKnot(addKnot(null, at(1, 1)))).toBeNull();
  });

  it('closes only from three anchors, near the first one on screen', () => {
    const screen = (p: { x: number; y: number }) => ({ x: p.x * 2, y: p.y * 2 });
    expect(hitsFirst(triangle(), at(22, 22), screen)).toBe(true);
    expect(hitsFirst(triangle(), at(40, 40), screen)).toBe(false);
    expect(hitsFirst(removeLastKnot(triangle())!, at(20, 20), screen)).toBe(false);
  });

  it('writes the engine path: corners as [x, y], curves with their handles', () => {
    const p = dragLastHandle(triangle(), at(70, 100));
    expect(toEnginePath(p, true)).toEqual({
      subpaths: [{ closed: true, knots: [[10, 10], [90, 10], { anchor: [50, 80], in: [30, 60], out: [70, 100], smooth: true }] }],
    });
  });

  it('makes a filled shape when closed, a stroked one when open, or the work path in Path mode', () => {
    expect(commitCall(triangle(), true, 'shape', '#ff0000')![0]).toBe('shape.create');
    expect(commitCall(triangle(), true, 'shape', '#ff0000')![1]).toMatchObject({ kind: 'path', fill: '#ff0000' });
    expect(commitCall(triangle(), false, 'shape', '#ff0000')![1]).toMatchObject({ fill: null, stroke: { width: 2, color: '#ff0000' } });
    expect(commitCall(triangle(), true, 'path', '#ff0000')![0]).toBe('path.set');
    expect(commitCall(addKnot(null, at(1, 1)), false, 'shape', '#000')).toBeNull();
    expect(commitCall(removeLastKnot(triangle())!, true, 'shape', '#000')).toBeNull();
  });

  it('outlines straight and curved segments, with a closing one when closed', () => {
    const p = dragLastHandle(triangle(), at(70, 100));
    expect(segments(p, false)).toHaveLength(2);
    const closed = segments(p, true);
    expect(closed).toHaveLength(3);
    expect(closed[0]!.c1).toBeUndefined();
    // The segment into a curved anchor bends toward its incoming handle; the closing one leaves by its outgoing handle.
    expect(closed[1]).toMatchObject({ c1: { x: 90, y: 10 }, c2: { x: 30, y: 60 } });
    expect(closed[2]!.c1).toEqual({ x: 70, y: 100 });
  });
});

describe('Pen tool on the canvas', () => {
  const call = (app: App, method: string, params: Record<string, unknown> = {}) => handleControl(app, { method, params });
  const setup = async () => {
    document.body.innerHTML = '<div id="root"></div>';
    const engine = new FakeEngine();
    const app = new App(engine);
    mount(document.getElementById('root')!, app);
    await call(app, 'engine.execute', { command: 'file.new', params: { width: 200, height: 200 } });
    await call(app, 'ui.set', { tool: 'pen' });
    return { app, engine };
  };
  const click = (app: App, x: number, y: number) => call(app, 'ui.pointer', { events: [{ kind: 'down', x, y }, { kind: 'up', x, y }] });
  const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('clicking adds anchors; clicking the first one closes the path into a shape layer', async () => {
    const { app, engine } = await setup();
    await click(app, 20, 20);
    await click(app, 120, 20);
    await click(app, 70, 110);
    expect(app.pen!.knots).toHaveLength(3);
    await click(app, 20, 20);
    expect(app.pen).toBeNull();
    const made = engine.calls.find(([id]) => id === 'shape.create');
    expect(made?.[1]).toMatchObject({ kind: 'path', fill: expect.any(String) });
    expect((made?.[1] as { path: { subpaths: { closed: boolean; knots: unknown[] }[] } }).path.subpaths[0]).toMatchObject({ closed: true });
  });

  it('dragging after a click makes a curve anchor', async () => {
    const { app } = await setup();
    await call(app, 'ui.pointer', { events: [{ kind: 'down', x: 40, y: 40 }, { kind: 'move', x: 80, y: 40 }, { kind: 'up', x: 80, y: 40 }] });
    const k = app.pen!.knots[0]!;
    expect(k.out).toEqual({ x: 80, y: 40 });
    expect(k.in).toEqual({ x: 0, y: 40 });
  });

  it('Enter finishes an open path as a stroked shape; Escape throws it away; Backspace removes a point', async () => {
    const { app, engine } = await setup();
    await click(app, 20, 20);
    await click(app, 100, 60);
    key('Backspace');
    expect(app.pen!.knots).toHaveLength(1);
    await click(app, 100, 60);
    key('Enter');
    expect(app.pen).toBeNull();
    expect(engine.calls.filter(([id]) => id === 'shape.create')).toHaveLength(1);
    await click(app, 20, 20);
    await click(app, 100, 60);
    key('Escape');
    expect(app.pen).toBeNull();
    expect(engine.calls.filter(([id]) => id === 'shape.create')).toHaveLength(1);
  });

  it('Path mode makes the work path, and picking another tool finishes the path in progress', async () => {
    const { app, engine } = await setup();
    app.setPenMode('path');
    await click(app, 20, 20);
    await click(app, 100, 60);
    app.tools.select('brush');
    expect(app.pen).toBeNull();
    expect(engine.calls.find(([id]) => id === 'path.set')?.[1]).toMatchObject({ name: 'work' });
  });
});
