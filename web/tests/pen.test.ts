import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/app';
import { handleControl } from '../src/control';
import { mount } from '../src/main';
import { addKnot, commitCall, dragLastHandle, hitsFirst, removeLastKnot, repeatsLast, segments, toEnginePath, type PenPath } from '../src/tools/pen';
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

  it('a double-click adds one anchor, not two on the same spot', async () => {
    const { app } = await setup();
    await click(app, 40, 40);
    await click(app, 41, 40);
    expect(app.pen!.knots).toHaveLength(1);
    await click(app, 120, 40);
    expect(app.pen!.knots).toHaveLength(2);
    expect(repeatsLast(addKnot(null, at(10, 10)), at(12, 11), (p) => p)).toBe(true);
    expect(repeatsLast(addKnot(null, at(10, 10)), at(20, 10), (p) => p)).toBe(false);
  });

  it('Ctrl+Z while drawing takes the last anchor away and leaves the document\'s history alone', async () => {
    const { app, engine } = await setup();
    await click(app, 20, 20);
    await click(app, 100, 60);
    const calls = engine.calls.length;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(app.pen!.knots).toHaveLength(1);
    expect(engine.calls.length).toBe(calls);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(app.pen).toBeNull();
  });

  it('a path in progress is dropped when another document becomes the active one', async () => {
    const { app, engine } = await setup();
    await click(app, 20, 20);
    await click(app, 100, 60);
    await call(app, 'engine.execute', { command: 'file.new', params: { width: 80, height: 80, name: 'B' } });
    expect(app.pen).toBeNull();
    expect(engine.calls.filter(([id]) => id === 'shape.create')).toHaveLength(0);
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

import { convertCall, hasHandle, hitTest, nextIndex, overlayPoints, segmentAt, select, smoothOut, type EnginePath } from '../src/tools/pathedit';

const knot = (x: number, y: number, ix = x, iy = y, ox = x, oy = y) => ({ anchor: [x, y] as [number, number], in: [ix, iy] as [number, number], out: [ox, oy] as [number, number], smooth: ix !== x || ox !== x });
const square = (): EnginePath => ({ subpaths: [{ closed: true, knots: [knot(0, 0), knot(100, 0), knot(100, 100), knot(0, 100)] }] });
const scale = (p: { x: number; y: number }) => ({ x: p.x * 2, y: p.y * 2 });

describe('path editing: what is under the pointer', () => {
  it('finds an anchor within its radius, and prefers it to the segment through it', () => {
    expect(hitTest(square(), [], at(200, 2), scale)).toEqual({ kind: 'anchor', sub: 0, knot: 1 });
    expect(hitTest(square(), [], at(100, 2), scale)).toMatchObject({ kind: 'segment', sub: 0, knot: 0 });
  });

  it('finds a selected anchor\'s handle before the anchor under it, and ignores handles of unselected ones', () => {
    const path: EnginePath = { subpaths: [{ closed: false, knots: [knot(50, 50, 40, 50, 60, 50), knot(150, 50)] }] };
    expect(hitTest(path, [[0, 0]], at(120, 100), scale)).toEqual({ kind: 'handle', sub: 0, knot: 0, which: 'out' });
    expect(hitTest(path, [], at(120, 100), scale)).toMatchObject({ kind: 'segment' });
  });

  it('finds a point along a segment, with its t; the closing segment of a closed subpath counts', () => {
    const bottom = hitTest(square(), [], at(100, 200), scale);
    expect(bottom).toMatchObject({ kind: 'segment', sub: 0, knot: 2 });
    const closing = hitTest(square(), [], at(2, 100), scale);
    expect(closing).toMatchObject({ kind: 'segment', sub: 0, knot: 3 });
    const t = (closing as { t: number }).t;
    expect(segmentAt(square().subpaths[0]!.knots[3]!, square().subpaths[0]!.knots[0]!, t)[1]).toBeCloseTo(100 - t * 100, 5);
    expect(hitTest(square(), [], at(100, 100), scale)).toBeNull();
  });

  it('follows a curved segment, not the straight line between its anchors', () => {
    const path: EnginePath = { subpaths: [{ closed: false, knots: [knot(0, 0, 0, 0, 0, 100), knot(100, 0, 100, 100, 100, 0)] }] };
    expect(hitTest(path, [], at(100, 150), scale)).toMatchObject({ kind: 'segment' });
    expect(hitTest(path, [], at(100, 0), scale)).toBeNull();
  });

  it('knows where a segment leaves and which anchor it reaches', () => {
    const sq = square().subpaths[0]!;
    expect(nextIndex(sq, 3)).toBe(0);
    expect(nextIndex({ ...sq, closed: false }, 3)).toBeNull();
    expect(nextIndex(sq, 0)).toBe(1);
  });
});

describe('path editing: selection and conversion', () => {
  it('a plain click selects one anchor; Shift adds and removes; clicking a selected one keeps the group', () => {
    expect(select([], [0, 1], false)).toEqual([[0, 1]]);
    expect(select([[0, 1]], [0, 2], true)).toEqual([[0, 1], [0, 2]]);
    expect(select([[0, 1], [0, 2]], [0, 1], true)).toEqual([[0, 2]]);
    expect(select([[0, 1], [0, 2]], [0, 1], false)).toEqual([[0, 1], [0, 2]]);
    expect(select([[0, 1]], [0, 3], false)).toEqual([[0, 3]]);
  });

  it('Alt-click on a corner asks for a smooth point along its neighbours, on a curve for a corner', () => {
    const call = convertCall(square(), [0, 1])!;
    expect(call).toMatchObject({ subpath: 0, knot: 1 });
    // Along the line between its neighbours (0,0) and (100,100), a third of the way to the nearer one.
    const reach = 100 / 3 / Math.SQRT2;
    expect(call.out).toEqual([expect.closeTo(100 + reach, 5), expect.closeTo(reach, 5)]);
    const curved: EnginePath = { subpaths: [{ closed: true, knots: [knot(0, 0), knot(100, 0, 80, 0, 120, 0), knot(100, 100)] }] };
    expect(convertCall(curved, [0, 1])).toEqual({ subpath: 0, knot: 1 });
    expect(convertCall(curved, [3, 0])).toBeNull();
    expect(hasHandle(curved.subpaths[0]!.knots[1]!, 'out')).toBe(true);
    // An end of an open subpath has one neighbour, so the handle runs toward it.
    const open = { closed: false, knots: [knot(0, 0), knot(90, 0)] };
    expect(smoothOut(open, 0)).toEqual([30, 0]);
  });

  it('lists anchors, and handles only for the selected ones', () => {
    const path: EnginePath = { subpaths: [{ closed: false, knots: [knot(50, 50, 40, 50, 60, 50), knot(150, 50, 140, 50, 160, 50)] }] };
    const o = overlayPoints(path, [[0, 0]]);
    expect(o.anchors.map((a) => a.selected)).toEqual([true, false]);
    expect(o.handles).toHaveLength(2);
    expect(overlayPoints(path, []).handles).toHaveLength(0);
  });
});

describe('Direct Selection on the canvas', () => {
  const call = (app: App, method: string, params: Record<string, unknown> = {}) => handleControl(app, { method, params });
  const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const drag = (app: App, from: [number, number], to: [number, number], mods: Record<string, boolean> = {}) =>
    call(app, 'ui.pointer', { ...mods, events: [{ kind: 'down', x: from[0], y: from[1] }, { kind: 'move', x: to[0], y: to[1] }, { kind: 'up', x: to[0], y: to[1] }] });
  const setup = async (drawPath = true) => {
    document.body.innerHTML = '<div id="root"></div>';
    const engine = new FakeEngine();
    const app = new App(engine);
    mount(document.getElementById('root')!, app);
    await call(app, 'engine.execute', { command: 'file.new', params: { width: 400, height: 400 } });
    if (drawPath) await call(app, 'engine.execute', { command: 'shape.create', params: { kind: 'path', path: { subpaths: [{ closed: true, knots: [[100, 100], [300, 100], [300, 300]] }] }, fill: '#000' } });
    await call(app, 'ui.set', { tool: 'pathSelect' });
    return { app, engine };
  };
  const last = (engine: FakeEngine, id: string) => engine.calls.filter(([c]) => c === id).at(-1)?.[1];

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('loads the active shape layer\'s path when the tool is picked, and nothing without one', async () => {
    const { app } = await setup();
    expect(app.pathEdit?.target).toBe('layer');
    expect(app.pathEdit?.path.subpaths[0]!.knots).toHaveLength(3);
    const none = await setup(false);
    expect(none.app.pathEdit).toBeNull();
    none.app.tools.select('brush');
  });

  it('clicking an anchor selects it, Shift adds another, clicking empty space clears them', async () => {
    const { app } = await setup();
    await call(app, 'ui.pointer', { events: [{ kind: 'down', x: 100, y: 100 }, { kind: 'up', x: 100, y: 100 }] });
    expect(app.pathEdit!.selected).toEqual([[0, 0]]);
    await call(app, 'ui.pointer', { shift: true, events: [{ kind: 'down', x: 300, y: 100 }, { kind: 'up', x: 300, y: 100 }] });
    expect(app.pathEdit!.selected).toEqual([[0, 0], [0, 1]]);
    await call(app, 'ui.pointer', { events: [{ kind: 'down', x: 20, y: 380 }, { kind: 'up', x: 20, y: 380 }] });
    expect(app.pathEdit!.selected).toEqual([]);
  });

  it('dragging an anchor moves the selected anchors by the drag, as one coalesced step', async () => {
    const { app, engine } = await setup();
    await drag(app, [300, 100], [340, 130]);
    const moved = last(engine, 'path.moveAnchors');
    expect(moved).toMatchObject({ name: 'layer', anchors: [[0, 1]], move: [40, 30] });
    expect(typeof moved?.coalesce).toBe('string');
  });

  it('dragging a handle moves that handle to the pointer', async () => {
    const { app, engine } = await setup();
    engine.path!.subpaths[0]!.knots[1] = { anchor: [300, 100], in: [260, 100], out: [340, 100], smooth: true };
    app.refresh();
    await call(app, 'ui.pointer', { events: [{ kind: 'down', x: 300, y: 100 }, { kind: 'up', x: 300, y: 100 }] });
    await drag(app, [340, 100], [360, 160]);
    expect(last(engine, 'path.moveHandle')).toMatchObject({ subpath: 0, knot: 1, handle: 'out', to: [360, 160], independent: false });
  });

  it('dragging a segment bends it; Ctrl-click on one adds a point there', async () => {
    const { app, engine } = await setup();
    await drag(app, [200, 100], [200, 140]);
    expect(last(engine, 'path.bendSegment')).toMatchObject({ subpath: 0, knot: 0, move: [0, 40] });
    expect((last(engine, 'path.bendSegment') as { t: number }).t).toBeCloseTo(0.5, 1);
    await call(app, 'ui.pointer', { ctrl: true, events: [{ kind: 'down', x: 250, y: 100 }, { kind: 'up', x: 250, y: 100 }] });
    expect(last(engine, 'path.addAnchor')).toMatchObject({ subpath: 0, knot: 0 });
    expect(app.pathEdit!.selected).toEqual([[0, 1]]);
  });

  it('Alt-click converts a corner to smooth, and Delete removes the selected anchors from the end', async () => {
    const { app, engine } = await setup();
    await call(app, 'ui.pointer', { alt: true, events: [{ kind: 'down', x: 300, y: 300 }, { kind: 'up', x: 300, y: 300 }] });
    expect(last(engine, 'path.convertPoint')).toMatchObject({ subpath: 0, knot: 2, out: expect.any(Array) });
    await call(app, 'ui.pointer', { events: [{ kind: 'down', x: 100, y: 100 }, { kind: 'up', x: 100, y: 100 }] });
    await call(app, 'ui.pointer', { shift: true, events: [{ kind: 'down', x: 300, y: 100 }, { kind: 'up', x: 300, y: 100 }] });
    key('Delete');
    const removed = engine.calls.filter(([c]) => c === 'path.deleteAnchor').map(([, p]) => p.knot);
    expect(removed).toEqual([1, 0]);
    expect(app.pathEdit!.selected).toEqual([]);
  });

  it('picking another tool stops editing the path', async () => {
    const { app } = await setup();
    app.tools.select('brush');
    expect(app.pathEdit).toBeNull();
  });
});
