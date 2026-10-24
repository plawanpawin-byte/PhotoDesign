// The Pen tool's path, kept apart from the canvas so it can be tested: anchors are added by click,
// a drag pulls out symmetric curve handles, and the result is the engine's own path JSON.
import type { Point } from '../lib/viewport';

/** One anchor with its curve handles (absolute document coordinates); no handles is a corner. */
export interface PenKnot {
  anchor: Point;
  in?: Point;
  out?: Point;
}

/** Where the finished path goes: a shape layer filled with the foreground, or the document's work path. */
export type PenMode = 'shape' | 'path';

export interface PenPath {
  knots: PenKnot[];
}

/** Screen distance within which a click lands on the first anchor and closes the path. */
export const CLOSE_RADIUS = 8;
/** A drag shorter than this (document pixels) leaves the anchor a corner. */
const DRAG_SLOP = 2;

/** A new corner anchor after the existing ones. */
export function addKnot(path: PenPath | null, at: Point): PenPath {
  return { knots: [...(path?.knots ?? []), { anchor: { ...at } }] };
}

/** Pulls the last anchor's handles out to `to`: the outgoing handle follows the pointer, the incoming one mirrors it. */
export function dragLastHandle(path: PenPath, to: Point): PenPath {
  const last = path.knots.at(-1);
  if (!last) return path;
  if (Math.hypot(to.x - last.anchor.x, to.y - last.anchor.y) < DRAG_SLOP) {
    const { in: _in, out: _out, ...corner } = last;
    return { knots: [...path.knots.slice(0, -1), corner] };
  }
  const knot: PenKnot = { anchor: last.anchor, out: { ...to }, in: { x: 2 * last.anchor.x - to.x, y: 2 * last.anchor.y - to.y } };
  return { knots: [...path.knots.slice(0, -1), knot] };
}

/** Removes the last anchor (Backspace); `null` once none is left. */
export function removeLastKnot(path: PenPath): PenPath | null {
  return path.knots.length > 1 ? { knots: path.knots.slice(0, -1) } : null;
}

/** Whether a screen point is close enough to the first anchor to close the path (needs three anchors). */
export function hitsFirst(path: PenPath, screen: Point, toScreen: (p: Point) => Point): boolean {
  const first = path.knots[0];
  if (!first || path.knots.length < 3) return false;
  const s = toScreen(first.anchor);
  return Math.hypot(screen.x - s.x, screen.y - s.y) <= CLOSE_RADIUS;
}

const pair = (p: Point): [number, number] => [p.x, p.y];

/** The engine's path JSON for these anchors: `[x, y]` for a corner, `{anchor, in, out, smooth}` for a curve. */
export function toEnginePath(path: PenPath, closed: boolean) {
  const knots = path.knots.map((k) => (k.in && k.out ? { anchor: pair(k.anchor), in: pair(k.in), out: pair(k.out), smooth: true } : pair(k.anchor)));
  return { subpaths: [{ closed, knots }] };
}

/** The engine command that makes the finished path, or `null` when there is too little to make. */
export function commitCall(path: PenPath, closed: boolean, mode: PenMode, foreground: string): [string, Record<string, unknown>] | null {
  if (path.knots.length < 2 || (closed && path.knots.length < 3)) return null;
  const engine = toEnginePath(path, closed);
  if (mode === 'path') return ['path.set', { name: 'work', path: engine }];
  // An open path has no inside to fill, so it is drawn as a stroke.
  return closed
    ? ['shape.create', { kind: 'path', path: engine, fill: foreground }]
    : ['shape.create', { kind: 'path', path: engine, fill: null, stroke: { width: 2, color: foreground } }];
}

/** The outline of the path as segments to draw: a straight line or a cubic curve between anchors. */
export interface PenSegment {
  from: Point;
  to: Point;
  c1?: Point;
  c2?: Point;
}

export function segments(path: PenPath, closed: boolean): PenSegment[] {
  const out: PenSegment[] = [];
  const n = path.knots.length;
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const a = path.knots[i]!;
    const b = path.knots[(i + 1) % n]!;
    const curved = a.out || b.in;
    out.push({ from: a.anchor, to: b.anchor, ...(curved ? { c1: a.out ?? a.anchor, c2: b.in ?? b.anchor } : {}) });
  }
  return out;
}
