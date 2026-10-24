// Editing an existing path with the Direct Selection tool: what the pointer is on (a handle, an
// anchor or a segment) and what to ask the engine's path commands to do about it. The engine owns
// the geometry (`path.moveAnchors`, `path.moveHandle`, `path.bendSegment`, …); this only decides.
import type { Point } from '../lib/viewport';

type Pair = [number, number];

/** An anchor as the engine reports it: absolute handles, equal to the anchor when retracted. */
export interface EngineKnot {
  anchor: Pair;
  in: Pair;
  out: Pair;
  smooth: boolean;
}

export interface EngineSubpath {
  closed: boolean;
  knots: EngineKnot[];
  op?: string;
}

export interface EnginePath {
  subpaths: EngineSubpath[];
  fillRule?: string;
  inverted?: boolean;
}

/** `[subpath, knot]`: which anchor. */
export type KnotRef = [number, number];

export type Hit =
  | { kind: 'handle'; sub: number; knot: number; which: 'in' | 'out' }
  | { kind: 'anchor'; sub: number; knot: number }
  | { kind: 'segment'; sub: number; knot: number; t: number };

/** Screen distances within which a click lands on a point, a handle or a segment. */
export const HIT_ANCHOR = 7;
export const HIT_HANDLE = 6;
export const HIT_SEGMENT = 6;
const SAMPLES = 24;

const dist = (a: Pair, b: Pair) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const same = (a: Pair, b: Pair) => a[0] === b[0] && a[1] === b[1];
const pt = (p: Pair): Point => ({ x: p[0], y: p[1] });

export const refEquals = (a: KnotRef, b: KnotRef) => a[0] === b[0] && a[1] === b[1];

/** A handle that is pulled out, not sitting on its anchor. */
export function hasHandle(k: EngineKnot, which: 'in' | 'out'): boolean {
  return !same(k[which], k.anchor);
}

/** The anchor after `knot` in its subpath: the segment's far end (wrapping when closed), or `null` at an open end. */
export function nextIndex(sub: EngineSubpath, knot: number): number | null {
  if (knot + 1 < sub.knots.length) return knot + 1;
  return sub.closed && sub.knots.length > 1 ? 0 : null;
}

/** The point at `t` along the segment leaving `a` toward `b`: a line, or a cubic through the handles. */
export function segmentAt(a: EngineKnot, b: EngineKnot, t: number): Pair {
  if (!hasHandle(a, 'out') && !hasHandle(b, 'in')) return [a.anchor[0] + (b.anchor[0] - a.anchor[0]) * t, a.anchor[1] + (b.anchor[1] - a.anchor[1]) * t];
  const u = 1 - t;
  const f = (i: 0 | 1) => u * u * u * a.anchor[i] + 3 * u * u * t * a.out[i] + 3 * u * t * t * b.in[i] + t * t * t * b.anchor[i];
  return [f(0), f(1)];
}

/** What is under the screen point: a selected anchor's handle first, then an anchor, then a segment. */
export function hitTest(path: EnginePath, selected: readonly KnotRef[], at: Point, toScreen: (p: Point) => Point): Hit | null {
  const close = (p: Pair, radius: number) => {
    const s = toScreen(pt(p));
    return Math.hypot(s.x - at.x, s.y - at.y) <= radius;
  };
  for (const [si, ki] of selected) {
    const k = path.subpaths[si]?.knots[ki];
    if (!k) continue;
    for (const which of ['out', 'in'] as const) if (hasHandle(k, which) && close(k[which], HIT_HANDLE)) return { kind: 'handle', sub: si, knot: ki, which };
  }
  // Later anchors win a tie, as the one drawn on top.
  for (let si = path.subpaths.length - 1; si >= 0; si--) {
    const sub = path.subpaths[si]!;
    for (let ki = sub.knots.length - 1; ki >= 0; ki--) if (close(sub.knots[ki]!.anchor, HIT_ANCHOR)) return { kind: 'anchor', sub: si, knot: ki };
  }
  let best: Hit | null = null;
  let bestDistance = HIT_SEGMENT;
  path.subpaths.forEach((sub, si) => {
    sub.knots.forEach((a, ki) => {
      const ni = nextIndex(sub, ki);
      if (ni === null) return;
      const b = sub.knots[ni]!;
      for (let i = 0; i <= SAMPLES; i++) {
        const t = i / SAMPLES;
        const s = toScreen(pt(segmentAt(a, b, t)));
        const d = Math.hypot(s.x - at.x, s.y - at.y);
        if (d < bestDistance) {
          bestDistance = d;
          best = { kind: 'segment', sub: si, knot: ki, t: Math.min(0.99, Math.max(0.01, t)) };
        }
      }
    });
  });
  return best;
}

/** Toggling an anchor's selection (Shift-click), or making it the only one. */
export function select(selected: readonly KnotRef[], ref: KnotRef, additive: boolean): KnotRef[] {
  const has = selected.some((s) => refEquals(s, ref));
  if (additive) return has ? selected.filter((s) => !refEquals(s, ref)) : [...selected, ref];
  return has && selected.length > 1 ? [...selected] : [ref];
}

/** The `out` handle that makes a corner anchor smooth: along the line between its neighbours, a third of the way to the next. */
export function smoothOut(sub: EngineSubpath, knot: number): Pair {
  const k = sub.knots[knot]!;
  const n = sub.knots.length;
  const prev = sub.knots[knot - 1] ?? (sub.closed ? sub.knots[n - 1] : undefined) ?? k;
  const next = sub.knots[knot + 1] ?? (sub.closed ? sub.knots[0] : undefined) ?? k;
  const dx = next.anchor[0] - prev.anchor[0];
  const dy = next.anchor[1] - prev.anchor[1];
  const len = Math.hypot(dx, dy) || 1;
  const reach = Math.min(dist(k.anchor, next.anchor), dist(k.anchor, prev.anchor) || Infinity) / 3 || 10;
  return [k.anchor[0] + (dx / len) * reach, k.anchor[1] + (dy / len) * reach];
}

/** The engine call that turns an anchor between corner and smooth (Alt-click). */
export function convertCall(path: EnginePath, ref: KnotRef): Record<string, unknown> | null {
  const sub = path.subpaths[ref[0]];
  const k = sub?.knots[ref[1]];
  if (!sub || !k) return null;
  const curved = hasHandle(k, 'in') || hasHandle(k, 'out');
  return curved ? { subpath: ref[0], knot: ref[1] } : { subpath: ref[0], knot: ref[1], out: smoothOut(sub, ref[1]) };
}

/** What to draw, in document pixels: the anchors, and the handles of the selected ones. */
export function overlayPoints(path: EnginePath, selected: readonly KnotRef[]) {
  const anchors: { ref: KnotRef; at: Point; selected: boolean }[] = [];
  const handles: { from: Point; to: Point }[] = [];
  path.subpaths.forEach((sub, si) =>
    sub.knots.forEach((k, ki) => {
      const isSelected = selected.some((s) => refEquals(s, [si, ki]));
      anchors.push({ ref: [si, ki], at: pt(k.anchor), selected: isSelected });
      if (isSelected) for (const which of ['in', 'out'] as const) if (hasHandle(k, which)) handles.push({ from: pt(k.anchor), to: pt(k[which]) });
    }),
  );
  return { anchors, handles };
}
