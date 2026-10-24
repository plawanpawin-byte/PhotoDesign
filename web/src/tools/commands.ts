// What each tool asks the engine to do: a finished stroke, click or drag becomes one engine
// command with its parameters. Pure functions of the gesture and the tool settings, so they can be
// tested without a canvas.
import type { BrushSettings, Rect, RetouchSettings, SelectSettings } from '../app';
import type { Point } from '../lib/viewport';
import type { ToolId } from './tools';

export type EngineCall = [id: string, params: Record<string, unknown>];

export interface StrokeContext {
  brush: BrushSettings;
  retouch: RetouchSettings;
  select: SelectSettings;
  foreground: string;
  zoom: number;
  hasSelection: boolean;
  /** Clone Stamp / Healing Brush: where to sample, or how far from the stroke. */
  source: { at?: Point; offset?: Point };
}

const pct = (v: number) => Math.max(1, Math.min(100, Math.round(v * 100)));

/** The engine command for a finished stroke of a painting or retouching tool. */
export function strokeCall(tool: ToolId, points: number[][], c: StrokeContext): EngineCall | null {
  if (!points.length) return null;
  const b = c.brush;
  const r = c.retouch;
  // Retouching commands take hardness, opacity and flow as percentages.
  const retouch = { points, size: b.size, hardness: Math.round(b.hardness * 100), opacity: pct(b.opacity), flow: pct(b.flow) };
  const source = c.source.offset ? { offset: [Math.round(c.source.offset.x), Math.round(c.source.offset.y)] } : c.source.at ? { source: [Math.round(c.source.at.x), Math.round(c.source.at.y)] } : null;
  switch (tool) {
    case 'brush':
      return ['paint.stroke', { points, size: b.size, hardness: b.hardness, opacity: b.opacity, flow: b.flow, zoom: c.zoom, color: c.foreground }];
    case 'eraser':
      return ['paint.stroke', { points, size: b.size, hardness: b.hardness, opacity: b.opacity, flow: b.flow, zoom: c.zoom, erase: true }];
    case 'pencil':
      return ['paint.pencil', { points, size: b.size, opacity: b.opacity, color: c.foreground }];
    case 'mixer':
      return ['paint.mixerBrush', { points, size: b.size, color: c.foreground }];
    case 'colorReplace':
      return ['paint.colorReplacement', { points, size: b.size, color: c.foreground }];
    case 'backgroundEraser':
      return ['paint.backgroundEraser', { points, size: b.size, hardness: b.hardness }];
    case 'cloneStamp':
      return source ? ['paint.cloneStamp', { ...retouch, ...source, aligned: r.aligned }] : null;
    case 'healing':
      return source ? ['paint.healingBrush', { ...retouch, ...source, aligned: r.aligned }] : null;
    case 'patternStamp':
      return ['paint.patternStamp', retouch];
    case 'historyBrush':
      return ['paint.historyBrush', retouch];
    case 'spotHealing':
      return ['paint.spotHealing', { ...retouch, type: r.healType }];
    case 'blur':
      return ['paint.blur', { ...retouch, strength: r.strength }];
    case 'sharpen':
      return ['paint.sharpen', { ...retouch, strength: r.strength }];
    case 'smudge':
      return ['paint.smudge', { ...retouch, strength: r.strength }];
    case 'dodge':
      return ['paint.dodge', { ...retouch, range: r.range, exposure: r.exposure }];
    case 'burn':
      return ['paint.burn', { ...retouch, range: r.range, exposure: r.exposure }];
    case 'sponge':
      return ['paint.sponge', { ...retouch, mode: r.spongeMode }];
    case 'quickSelect': {
      // Quick Selection grows the selection stroke by stroke, unless set to subtract.
      const mode = c.select.mode === 'subtract' ? 'subtract' : c.hasSelection ? 'add' : 'replace';
      return ['select.quick', { points: points.map((p) => [Math.round(p[0]!), Math.round(p[1]!)]), size: b.size, mode }];
    }
    default:
      return null;
  }
}

const round = (p: Point) => [Math.round(p.x), Math.round(p.y)];

/** The engine command for a finished drag (a click when `moved` is false), or null for none. */
export function dragCall(tool: ToolId, start: Point, end: Point, path: Point[], moved: boolean, c: StrokeContext): EngineCall | null {
  const rect: Rect = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y) };
  const box = [Math.round(rect.x), Math.round(rect.y), Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height))];
  switch (tool) {
    case 'move':
      return moved ? ['layer.translate', { dx: Math.round(end.x - start.x), dy: Math.round(end.y - start.y) }] : null;
    case 'objectSelect':
      return moved ? ['select.object', { rect: box, mode: c.select.mode }] : ['select.object', { point: round(start), mode: c.select.mode }];
    case 'patch':
      return moved && c.hasSelection ? ['paint.patch', { offset: [Math.round(end.x - start.x), Math.round(end.y - start.y)] }] : null;
    case 'magneticLasso': {
      if (!moved || path.length < 3) return null;
      // Fastening points every few pixels along the traced path; the engine snaps the outline to edges between them.
      const pts: number[][] = [];
      let last: Point | null = null;
      for (const p of path) {
        if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 8) {
          pts.push(round(p));
          last = p;
        }
      }
      return pts.length >= 3 ? ['select.magneticLasso', { points: pts, mode: c.select.mode, feather: c.select.feather }] : null;
    }
    case 'rectShape':
      return moved ? ['shape.create', { kind: 'rect', rect: box, fill: c.foreground }] : null;
    case 'ellipseShape':
      return moved ? ['shape.create', { kind: 'ellipse', rect: box, fill: c.foreground }] : null;
    case 'lineShape':
      return moved ? ['shape.create', { kind: 'line', from: round(start), to: round(end), weight: c.retouch.lineWeight, fill: c.foreground }] : null;
    default:
      return null;
  }
}

/** The engine command for a single click of a click tool. */
export function clickCall(tool: ToolId, at: Point, c: StrokeContext & { tolerance: number; contiguous: boolean }): EngineCall | null {
  const x = Math.floor(at.x);
  const y = Math.floor(at.y);
  switch (tool) {
    case 'fill':
      return ['paint.bucket', { x, y, tolerance: c.tolerance, contiguous: c.contiguous }];
    case 'wand':
      return ['select.magicWand', { x, y, tolerance: c.tolerance, contiguous: c.contiguous, mode: c.select.mode }];
    case 'magicEraser':
      return ['paint.magicEraser', { x, y, tolerance: c.tolerance, contiguous: c.contiguous }];
    case 'redEye':
      return ['paint.redEye', { x, y }];
    default:
      return null;
  }
}
