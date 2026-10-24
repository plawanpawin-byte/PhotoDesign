// The canvas: shows the engine's render of the active document, and turns pointer input into
// engine commands for the tool in hand.
import type { App, Rect } from '../app';
import { bytesToHex, toHex } from '../lib/color';
import { pan, stepZoom, toDoc, toScreen, zoomAt, type Point } from '../lib/viewport';
import { clickCall, dragCall, strokeCall, type StrokeContext } from '../tools/commands';
import { convertCall, hasHandle, hitTest, nextIndex, overlayPoints, select as selectKnot, type Hit } from '../tools/pathedit';
import { hitsFirst, segments } from '../tools/pen';
import { STROKE_TOOLS, toolDef, type ToolId } from '../tools/tools';
import { t } from '../lib/i18n';
import { h } from './dom';

/** Longest side the engine renders for the screen; larger documents are shown scaled. */
const RENDER_MAX = 4096;
/** A drag shorter than this (screen pixels) counts as a click. */
const CLICK_SLOP = 3;

interface Stroke {
  tool: ToolId;
  points: number[][];
  screen: Point[];
  erase: boolean;
}

/** Tools whose drag builds a shape: a rectangle, a path, a line or a move. */
const DRAG_TOOLS: readonly ToolId[] = ['marquee', 'ellipse', 'crop', 'gradient', 'lasso', 'magneticLasso', 'objectSelect', 'move', 'patch', 'rectShape', 'ellipseShape', 'lineShape'];
/** Drags that may leave the document (the rest are clamped to it). */
const UNCLAMPED: readonly ToolId[] = ['gradient', 'lasso', 'magneticLasso', 'move', 'patch', 'lineShape'];
/** Strokes drawn in the foreground colour while they're being made; the rest show their path. */
const COLOURED: readonly ToolId[] = ['brush', 'pencil', 'mixer', 'colorReplace'];

/** A drag that builds a shape: a rectangle, a lasso path or a gradient line. */
interface Drag {
  tool: ToolId;
  startScreen: Point;
  start: Point;
  end: Point;
  path: Point[];
}

/** The rectangle between two document points, normalised to positive size. */
export function rectBetween(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

export function canvasView(app: App): HTMLElement {
  const canvas = h('canvas.stage-canvas');
  const stage = h('div.stage', canvas);
  const ctx = canvas.getContext('2d');
  let image: HTMLCanvasElement | null = null;
  let base: ImageData | null = null;
  let shown: HTMLCanvasElement | null = null;
  let shownFor: unknown = null;
  const tinted = document.createElement('canvas');
  let renderedRevision = Number.NaN;
  let renderedDoc = -1;
  let pointer: Point | null = null;
  let stroke: Stroke | null = null;
  let drag: Drag | null = null;
  /** Pen: the last anchor's handles follow the pointer while it is held down. */
  let penDragging = false;
  /** Direct Selection: a drag in progress on an anchor, a handle or a segment, sent to the engine a frame at a time. */
  let pathDrag: { hit: Hit; last: Point; pending: Point; alt: boolean; coalesce: string } | null = null;
  let pathDragSeq = 0;
  let pathFlushQueued = false;
  let panning: { from: Point; pointerId: number; button: number } | null = null;
  let queued = false;
  let checker: CanvasPattern | null = null;
  let ants = 0;
  let antsTimer = 0;
  /** Clone Stamp / Healing Brush: the source's distance from the stroke once the first aligned stroke is made. */
  let cloneOffset: Point | null = null;
  let cloneFor: unknown = null;
  const context = (): StrokeContext => {
    if (cloneFor !== app.cloneSource) {
      cloneFor = app.cloneSource;
      cloneOffset = null;
    }
    return { brush: app.brush, retouch: app.retouch, select: app.select, foreground: app.foreground, zoom: app.view.zoom, hasSelection: !!app.doc?.hasSelection, source: cloneOffset && app.retouch.aligned ? { offset: cloneOffset } : app.cloneSource ? { at: app.cloneSource } : {} };
  };
  const runCall = (call: ReturnType<typeof strokeCall>) => (call ? app.run(call[0], call[1]) : undefined);

  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      draw();
    });
  };

  const syncImage = () => {
    const doc = app.doc;
    const active = app.state.session.active ?? -1;
    if (!doc) {
      image = null;
      renderedRevision = Number.NaN;
      return;
    }
    const revision = app.engine.revision();
    if (revision === renderedRevision && active === renderedDoc && image) return;
    try {
      const frame = app.engine.render(Math.min(RENDER_MAX, Math.max(doc.width, doc.height)));
      const off = image ?? document.createElement('canvas');
      off.width = frame.width;
      off.height = frame.height;
      const c = off.getContext('2d');
      base = new ImageData(new Uint8ClampedArray(frame.pixels.buffer as ArrayBuffer, frame.pixels.byteOffset, frame.pixels.byteLength), frame.width, frame.height);
      if (c) c.putImageData(base, 0, 0);
      image = off;
      shownFor = null;
      renderedRevision = revision;
      renderedDoc = active;
    } catch (e) {
      app.notify(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  /** The frame with the pending adjustment applied, or `null` when nothing is being previewed. */
  const previewImage = (docWidth: number): HTMLCanvasElement | null => {
    const p = app.preview;
    if (!p || !base) return null;
    if (shownFor === p && shown) return shown;
    try {
      const px = app.engine.preview(p.command, p.values, new Uint8Array(base.data.buffer, base.data.byteOffset, base.data.byteLength), base.width, base.height, base.width / Math.max(1, docWidth));
      tinted.width = base.width;
      tinted.height = base.height;
      tinted.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(px.buffer as ArrayBuffer, px.byteOffset, px.byteLength), base.width, base.height), 0, 0);
      shown = tinted;
      shownFor = p;
    } catch {
      return null;
    }
    return shown;
  };

  const draw = () => {
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = app.viewport;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const doc = app.doc;
    if (!doc) return;
    syncImage();
    const v = app.view;
    const w = doc.width * v.zoom;
    const hgt = doc.height * v.zoom;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(v.x, v.y, w, hgt);
    ctx.restore();
    checker ??= makeChecker(ctx);
    if (checker) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(v.x, v.y, w, hgt);
      ctx.clip();
      ctx.translate(v.x, v.y);
      ctx.fillStyle = checker;
      ctx.fillRect(0, 0, w, hgt);
      ctx.restore();
    }
    if (image) {
      ctx.imageSmoothingEnabled = v.zoom < 2;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(previewImage(doc.width) ?? image, v.x, v.y, w, hgt);
    }
    if (doc.selectionBounds) {
      const [sx, sy, sw, sh] = doc.selectionBounds;
      const a = toScreen(v, { x: sx, y: sy });
      outline(ctx, a.x, a.y, sw * v.zoom, sh * v.zoom, ants);
    }
    if (app.cropRect) drawCrop(ctx, app, app.cropRect);
    if (stroke && stroke.screen.length) drawStrokePreview(ctx, stroke, app);
    if (drag) drawDrag(ctx, drag, app);
    if (app.pen) drawPen(ctx, app, pointer, penDragging);
    if (app.pathEdit && app.tools.active === 'pathSelect') drawPathEdit(ctx, app);
    const tool = app.tools.active;
    if (pointer && STROKE_TOOLS.includes(tool) && !panning) {
      const r = Math.max(1, (app.brush.size * v.zoom) / 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, r + 0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, r - 0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  const local = (e: PointerEvent | WheelEvent): Point => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const updateCursor = () => {
    const tool = app.tools.active;
    if (panning) canvas.style.cursor = 'grabbing';
    else canvas.style.cursor = toolDef(tool).cursor;
  };

  const capture = (e: PointerEvent) => {
    try {
      canvas.setPointerCapture?.(e.pointerId);
    } catch {
      // a synthetic pointer has nothing to capture
    }
  };

  /** Sends the pending part of a Direct Selection drag to the engine; all of a drag's steps are one undo step. */
  const flushPathDrag = () => {
    pathFlushQueued = false;
    const d = pathDrag;
    const edit = app.pathEdit;
    if (!d || !edit) return;
    const [dx, dy] = [d.pending.x - d.last.x, d.pending.y - d.last.y];
    if (d.hit.kind !== 'handle' && !dx && !dy) return;
    d.last = d.pending;
    if (d.hit.kind === 'anchor') app.pathCall('moveAnchors', { anchors: edit.selected, move: [dx, dy] }, d.coalesce);
    else if (d.hit.kind === 'handle') app.pathCall('moveHandle', { subpath: d.hit.sub, knot: d.hit.knot, handle: d.hit.which, to: [d.pending.x, d.pending.y], independent: d.alt }, d.coalesce);
    else app.pathCall('bendSegment', { subpath: d.hit.sub, knot: d.hit.knot, t: d.hit.t, move: [dx, dy] }, d.coalesce);
  };

  const startPan = (e: PointerEvent) => {
    panning = { from: local(e), pointerId: e.pointerId, button: e.button };
    capture(e);
    updateCursor();
  };

  const clampToDoc = (d: Point): Point => {
    const doc = app.doc;
    return doc ? { x: Math.min(doc.width, Math.max(0, d.x)), y: Math.min(doc.height, Math.max(0, d.y)) } : d;
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (!app.doc) return;
    const p = local(e);
    pointer = p;
    const tool: ToolId = app.tools.active;
    if (e.button === 1 || (e.button === 0 && tool === 'hand')) {
      e.preventDefault();
      startPan(e);
      return;
    }
    if (e.button !== 0) return;
    const d = toDoc(app.view, p);
    if (tool === 'zoom') {
      app.setView(zoomAt(app.view, stepZoom(app.view.zoom, e.altKey ? -1 : 1), p));
    } else if ((tool === 'cloneStamp' || tool === 'healing') && e.altKey) {
      app.setCloneSource({ x: Math.round(d.x), y: Math.round(d.y) });
      app.notify(t('Source set'));
    } else if ((tool === 'cloneStamp' || tool === 'healing') && !app.cloneSource) {
      app.notify(t('Alt-click to set a source first'), 'error');
    } else if (tool === 'pathSelect') {
      capture(e);
      const edit = app.pathEdit;
      if (!edit) {
        app.notify(t('No path to edit: draw one with the Pen, or pick a shape layer'), 'error');
      } else {
        const hit = hitTest(edit.path, edit.selected, p, (q) => toScreen(app.view, q));
        if (!hit) {
          if (!e.shiftKey) app.selectPathKnots([]);
        } else if (hit.kind === 'segment' && (e.ctrlKey || e.metaKey)) {
          const added = app.pathCall('addAnchor', { subpath: hit.sub, knot: hit.knot, t: hit.t }) as { anchor?: { subpath: number; knot: number } } | undefined;
          if (added?.anchor) app.selectPathKnots([[added.anchor.subpath, added.anchor.knot]]);
        } else if (hit.kind === 'anchor' && e.altKey) {
          const call = convertCall(edit.path, [hit.sub, hit.knot]);
          app.selectPathKnots([[hit.sub, hit.knot]]);
          if (call) app.pathCall('convertPoint', call);
        } else {
          if (hit.kind === 'anchor') app.selectPathKnots(selectKnot(edit.selected, [hit.sub, hit.knot], e.shiftKey));
          pathDrag = { hit, last: d, pending: d, alt: e.altKey, coalesce: `path-edit-${++pathDragSeq}` };
        }
      }
    } else if (tool === 'pen') {
      capture(e);
      if (app.pen && hitsFirst(app.pen, p, (q) => toScreen(app.view, q))) {
        app.finishPen(true);
      } else {
        app.penAdd(d);
        penDragging = true;
      }
    } else if (STROKE_TOOLS.includes(tool)) {
      capture(e);
      stroke = { tool, points: [], screen: [], erase: tool === 'eraser' || tool === 'backgroundEraser' };
      addPoint(stroke, d, p, e);
    } else if (tool === 'eyedropper') {
      pick(app, d);
    } else if (tool === 'type') {
      // Keep the click from taking focus back from the text field it opens.
      e.preventDefault();
      typeAt(app, stage, d, p);
    } else if (tool === 'patch' && !app.doc.hasSelection) {
      app.notify(t('Select the area to patch first'), 'error');
    } else if (DRAG_TOOLS.includes(tool)) {
      capture(e);
      const c = UNCLAMPED.includes(tool) ? d : clampToDoc(d);
      drag = { tool, startScreen: p, start: c, end: c, path: [c] };
      if (tool === 'crop') app.setCrop(null);
    } else {
      runCall(clickCall(tool, d, { ...context(), tolerance: app.fill.tolerance, contiguous: app.fill.contiguous }));
    }
    schedule();
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = local(e);
    pointer = p;
    if (panning && e.pointerId === panning.pointerId) {
      app.setView(pan(app.view, p.x - panning.from.x, p.y - panning.from.y));
      panning.from = p;
      return;
    }
    if (penDragging) {
      app.penDrag(toDoc(app.view, p));
    } else if (pathDrag) {
      pathDrag.pending = toDoc(app.view, p);
      if (!pathFlushQueued) {
        pathFlushQueued = true;
        requestAnimationFrame(flushPathDrag);
      }
    } else if (stroke) {
      const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      for (const ce of events.length ? events : [e]) {
        const cp = local(ce);
        addPoint(stroke, toDoc(app.view, cp), cp, ce);
      }
    } else if (drag) {
      const d = toDoc(app.view, p);
      drag.end = UNCLAMPED.includes(drag.tool) ? d : clampToDoc(d);
      if (drag.tool === 'lasso' || drag.tool === 'magneticLasso') drag.path.push(drag.end);
    } else if (app.tools.active === 'eyedropper' && e.buttons === 1) {
      pick(app, toDoc(app.view, p));
    }
    schedule();
  });

  const finishDrag = (e: PointerEvent) => {
    const dr = drag;
    drag = null;
    if (!dr) return;
    const moved = Math.hypot(local(e).x - dr.startScreen.x, local(e).y - dr.startScreen.y) > CLICK_SLOP;
    const rect = rectBetween(dr.start, dr.end);
    switch (dr.tool) {
      case 'marquee':
      case 'ellipse':
        if (!moved || rect.width < 1 || rect.height < 1) {
          if (app.doc?.hasSelection) app.run('select.deselect');
        } else app.selectRect(rect, dr.tool === 'ellipse');
        break;
      case 'lasso':
        if (moved && dr.path.length >= 3) app.run('select.lasso', { points: dr.path.map((q) => [Math.round(q.x), Math.round(q.y)]), mode: app.select.mode, feather: app.select.feather });
        break;
      case 'crop':
        app.setCrop(moved && rect.width >= 1 && rect.height >= 1 ? rect : null);
        break;
      case 'gradient':
        if (moved) app.run('paint.gradient', { from: [dr.start.x, dr.start.y], to: [dr.end.x, dr.end.y], style: app.gradientStyle, colors: [app.foreground, app.background] });
        break;
      default:
        runCall(dragCall(dr.tool, dr.start, dr.end, dr.path, moved, context()));
        break;
    }
  };

  const finish = (e: PointerEvent) => {
    if (panning && e.pointerId === panning.pointerId) {
      panning = null;
      updateCursor();
    }
    penDragging = false;
    if (pathDrag) {
      pathDrag.pending = toDoc(app.view, local(e));
      flushPathDrag();
      pathDrag = null;
    }
    finishDrag(e);
    if (stroke) {
      const s = stroke;
      stroke = null;
      if (s.points.length === 1) s.points.push([...s.points[0]!]);
      const ctxNow = context();
      const result = runCall(strokeCall(s.tool, s.points, ctxNow)) as { offset?: number[] } | undefined;
      // An aligned clone keeps its distance from the stroke: the next stroke samples as far away.
      if ((s.tool === 'cloneStamp' || s.tool === 'healing') && app.cloneSource && !cloneOffset) {
        const off = Array.isArray(result?.offset) ? result!.offset : [app.cloneSource.x - s.points[0]![0]!, app.cloneSource.y - s.points[0]![1]!];
        cloneOffset = { x: Number(off[0]) || 0, y: Number(off[1]) || 0 };
      }
    }
    schedule();
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', (e) => {
    drag = null;
    finish(e);
  });
  canvas.addEventListener('pointerleave', () => {
    if (!stroke && !panning && !drag) {
      pointer = null;
      schedule();
    }
  });
  canvas.addEventListener('auxclick', (e) => e.preventDefault());
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!app.doc) return;
      e.preventDefault();
      const p = local(e);
      if (e.ctrlKey || e.metaKey || e.altKey) {
        const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025));
        app.setView(zoomAt(app.view, app.view.zoom * factor, p));
      } else {
        const unit = e.deltaMode === 1 ? 16 : 1;
        app.setView(pan(app.view, -e.deltaX * unit, -e.deltaY * unit));
      }
    },
    { passive: false },
  );

  const resize = () => {
    if (!stage.isConnected) return;
    const r = stage.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) app.setViewport({ width: Math.round(r.width), height: Math.round(r.height) });
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(stage);
  window.addEventListener('resize', resize);
  requestAnimationFrame(() => {
    resize();
    app.fitView();
  });

  // The selection outline's dashes crawl, but only while there is a selection to show.
  const animate = () => {
    window.clearInterval(antsTimer);
    if (app.doc?.selectionBounds) {
      antsTimer = window.setInterval(() => {
        if (!stage.isConnected) {
          window.clearInterval(antsTimer);
          return;
        }
        ants = (ants + 1) % 16;
        schedule();
      }, 120);
    }
  };
  app.on('state', () => {
    animate();
    schedule();
  });
  app.on('view', schedule);
  app.on('settings', schedule);
  app.on('crop', schedule);
  app.on('preview', schedule);
  app.on('pen', schedule);
  app.on('path', schedule);
  app.on('tool', () => {
    updateCursor();
    schedule();
  });
  // Pen: Enter finishes the open path, Escape throws it away, Backspace takes the last point back.
  const penKeys = (e: KeyboardEvent) => {
    if (!stage.isConnected) return window.removeEventListener('keydown', penKeys);
    const editing = app.tools.active === 'pathSelect' && !!app.pathEdit;
    if (!(editing || (app.pen && app.tools.active === 'pen'))) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
    if (editing) {
      if (e.key === 'Backspace' || e.key === 'Delete') app.deletePathKnots();
      else if (e.key === 'Escape') app.selectPathKnots([]);
      else return;
    } else if (e.key === 'Enter') app.finishPen(false);
    else if (e.key === 'Escape') app.cancelPen();
    else if (e.key === 'Backspace' || e.key === 'Delete') app.penUndo();
    else return;
    e.preventDefault();
  };
  window.addEventListener('keydown', penKeys);
  updateCursor();
  return stage;
}

/** The path being edited with Direct Selection: its outline, every anchor, and the handles of the selected anchors. */
function drawPathEdit(ctx: CanvasRenderingContext2D, app: App) {
  const edit = app.pathEdit;
  if (!edit) return;
  const sc = (p: Point) => toScreen(app.view, p);
  const at = (p: [number, number]) => sc({ x: p[0], y: p[1] });
  ctx.save();
  ctx.lineJoin = 'round';
  const trace = () => {
    ctx.beginPath();
    for (const sub of edit.path.subpaths) {
      const first = sub.knots[0];
      if (!first) continue;
      const s = at(first.anchor);
      ctx.moveTo(s.x, s.y);
      sub.knots.forEach((a, ki) => {
        const ni = nextIndex(sub, ki);
        if (ni === null) return;
        const b = sub.knots[ni]!;
        const end = at(b.anchor);
        if (hasHandle(a, 'out') || hasHandle(b, 'in')) ctx.bezierCurveTo(at(a.out).x, at(a.out).y, at(b.in).x, at(b.in).y, end.x, end.y);
        else ctx.lineTo(end.x, end.y);
      });
    }
  };
  trace();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.stroke();
  trace();
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = '#4da3ff';
  ctx.stroke();
  const { anchors, handles } = overlayPoints(edit.path, edit.selected);
  ctx.lineWidth = 1;
  for (const hd of handles) {
    const a = sc(hd.from);
    const b = sc(hd.to);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  for (const an of anchors) {
    const s = sc(an.at);
    ctx.fillStyle = an.selected ? '#4da3ff' : '#fff';
    ctx.fillRect(s.x - 3.5, s.y - 3.5, 7, 7);
    ctx.strokeRect(s.x - 3.5, s.y - 3.5, 7, 7);
  }
  ctx.restore();
}

/** The Pen tool's path: its outline, a rubber band to the pointer, and the anchors with their handles. */
function drawPen(ctx: CanvasRenderingContext2D, app: App, pointer: Point | null, dragging: boolean) {
  const path = app.pen;
  if (!path) return;
  const v = app.view;
  const sc = (p: Point) => toScreen(v, p);
  const trace = (from: Point, to: Point, c1?: Point, c2?: Point) => {
    const a = sc(from);
    const b = sc(to);
    ctx.moveTo(a.x, a.y);
    if (c1 && c2) ctx.bezierCurveTo(sc(c1).x, sc(c1).y, sc(c2).x, sc(c2).y, b.x, b.y);
    else ctx.lineTo(b.x, b.y);
  };
  ctx.save();
  ctx.lineJoin = 'round';
  const outline = (width: number, style: string, dash: number[] = []) => {
    ctx.lineWidth = width;
    ctx.strokeStyle = style;
    ctx.setLineDash(dash);
    ctx.beginPath();
    for (const s of segments(path, false)) trace(s.from, s.to, s.c1, s.c2);
    ctx.stroke();
  };
  outline(3, 'rgba(0,0,0,0.55)');
  outline(1.25, '#4da3ff');
  // Where the next segment would go, as a dashed line to the pointer.
  const last = path.knots.at(-1);
  if (last && pointer && !dragging) {
    const target = hitsFirst(path, pointer, sc) ? path.knots[0]!.anchor : null;
    const a = sc(last.anchor);
    const b = target ? sc(target) : pointer;
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#4da3ff';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    if (last.out) ctx.bezierCurveTo(sc(last.out).x, sc(last.out).y, b.x, b.y, b.x, b.y);
    else {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  path.knots.forEach((k, i) => {
    const a = sc(k.anchor);
    const isLast = i === path.knots.length - 1;
    // Handles of the newest anchor (and any curved one) hang off it as thin lines with round tips.
    for (const handle of [k.in, k.out]) {
      if (!handle || !(isLast || k.in)) continue;
      const hp = sc(handle);
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#4da3ff';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(hp.x, hp.y);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#4da3ff';
    ctx.fillStyle = isLast ? '#4da3ff' : '#fff';
    ctx.fillRect(a.x - 3.5, a.y - 3.5, 7, 7);
    ctx.strokeRect(a.x - 3.5, a.y - 3.5, 7, 7);
  });
  ctx.restore();
}

function outline(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, offset: number) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = '#000';
  ctx.lineDashOffset = offset;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.strokeStyle = '#fff';
  ctx.lineDashOffset = offset + 4.5;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.restore();
}

function drawCrop(ctx: CanvasRenderingContext2D, app: App, r: Rect) {
  const a = toScreen(app.view, { x: r.x, y: r.y });
  const w = r.width * app.view.zoom;
  const hgt = r.height * app.view.zoom;
  const doc = app.doc!;
  const tl = toScreen(app.view, { x: 0, y: 0 });
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.rect(tl.x, tl.y, doc.width * app.view.zoom, doc.height * app.view.zoom);
  ctx.rect(a.x, a.y, w, hgt);
  ctx.fill('evenodd');
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(a.x, a.y, w, hgt);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const f of [1 / 3, 2 / 3]) {
    ctx.moveTo(a.x + w * f, a.y);
    ctx.lineTo(a.x + w * f, a.y + hgt);
    ctx.moveTo(a.x, a.y + hgt * f);
    ctx.lineTo(a.x + w, a.y + hgt * f);
  }
  ctx.stroke();
  ctx.restore();
}

function drawDrag(ctx: CanvasRenderingContext2D, d: Drag, app: App) {
  const v = app.view;
  if (d.tool === 'objectSelect' || d.tool === 'rectShape' || d.tool === 'ellipseShape') {
    const r = rectBetween(d.start, d.end);
    const a = toScreen(v, { x: r.x, y: r.y });
    ctx.save();
    ctx.strokeStyle = d.tool === 'objectSelect' ? '#4a86e8' : '#fff';
    ctx.fillStyle = d.tool === 'objectSelect' ? 'rgba(74,134,232,0.12)' : app.foreground;
    ctx.globalAlpha = d.tool === 'objectSelect' ? 1 : 0.6;
    ctx.beginPath();
    if (d.tool === 'ellipseShape') ctx.ellipse(a.x + (r.width * v.zoom) / 2, a.y + (r.height * v.zoom) / 2, (r.width * v.zoom) / 2, (r.height * v.zoom) / 2, 0, 0, Math.PI * 2);
    else ctx.rect(a.x, a.y, r.width * v.zoom, r.height * v.zoom);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (d.tool === 'move' || d.tool === 'patch' || d.tool === 'lineShape') {
    const a = toScreen(v, d.start);
    const b = toScreen(v, d.end);
    ctx.save();
    ctx.lineWidth = d.tool === 'lineShape' ? Math.max(1, app.retouch.lineWeight * v.zoom) : 1.5;
    ctx.strokeStyle = d.tool === 'lineShape' ? app.foreground : '#fff';
    if (d.tool !== 'lineShape') ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    if (d.tool !== 'lineShape' && app.doc?.selectionBounds && d.tool === 'patch') {
      const [sx, sy, sw, sh] = app.doc.selectionBounds;
      const o = toScreen(v, { x: sx + d.end.x - d.start.x, y: sy + d.end.y - d.start.y });
      ctx.strokeRect(o.x, o.y, sw * v.zoom, sh * v.zoom);
    }
    ctx.restore();
    return;
  }
  if (d.tool === 'marquee' || d.tool === 'ellipse' || d.tool === 'crop') {
    const r = rectBetween(d.start, d.end);
    const a = toScreen(v, { x: r.x, y: r.y });
    if (d.tool === 'ellipse') {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#fff';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 1;
      ctx.beginPath();
      ctx.ellipse(a.x + (r.width * v.zoom) / 2, a.y + (r.height * v.zoom) / 2, (r.width * v.zoom) / 2, (r.height * v.zoom) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (d.tool === 'crop') drawCrop(ctx, app, r);
    else outline(ctx, a.x, a.y, r.width * v.zoom, r.height * v.zoom, 0);
  } else if (d.tool === 'lasso' || d.tool === 'magneticLasso') {
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#fff';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 1;
    ctx.beginPath();
    d.path.forEach((q, i) => {
      const s = toScreen(v, q);
      if (i) ctx.lineTo(s.x, s.y);
      else ctx.moveTo(s.x, s.y);
    });
    ctx.stroke();
    ctx.restore();
  } else if (d.tool === 'gradient') {
    const a = toScreen(v, d.start);
    const b = toScreen(v, d.end);
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    for (const [pt, color] of [[a, app.foreground], [b, app.background]] as const) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

function addPoint(stroke: Stroke, d: Point, screen: Point, e: PointerEvent) {
  const pressure = e.pointerType === 'pen' ? Math.max(0.01, e.pressure || 0) : 1;
  const point = [round2(d.x), round2(d.y), round2(pressure)];
  if (e.pointerType === 'pen') point.push(round2(e.tiltX || 0), round2(e.tiltY || 0));
  stroke.points.push(point);
  stroke.screen.push(screen);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function pick(app: App, d: Point) {
  const doc = app.doc;
  if (!doc || d.x < 0 || d.y < 0 || d.x >= doc.width || d.y >= doc.height) return;
  try {
    const c = app.engine.execute('document.sampleColor', { x: d.x, y: d.y }) as number[];
    if (!Array.isArray(c) || c.length < 3) return;
    const bytes = c.slice(0, 3).some((v) => v > 1);
    app.setForeground(bytes ? bytesToHex(c[0]!, c[1]!, c[2]!) : toHex(c));
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e), 'error');
  }
}

function drawStrokePreview(ctx: CanvasRenderingContext2D, stroke: Stroke, app: App) {
  const width = Math.max(1, app.brush.size * app.view.zoom);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  const coloured = COLOURED.includes(stroke.tool);
  ctx.globalAlpha = coloured ? Math.max(0.15, app.brush.opacity) : 0.35;
  ctx.strokeStyle = coloured ? app.foreground : stroke.erase ? '#d9d9d9' : '#9cc3ff';
  if (stroke.erase) ctx.setLineDash([Math.max(2, width / 3), Math.max(2, width / 3)]);
  ctx.beginPath();
  stroke.screen.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  if (stroke.screen.length === 1) {
    const p = stroke.screen[0]!;
    ctx.lineTo(p.x + 0.01, p.y);
  }
  ctx.stroke();
  ctx.restore();
}

/** The Type tool: a text field at the click; Enter makes a type layer, Escape or leaving it cancels. */
function typeAt(app: App, stage: HTMLElement, at: Point, screen: Point) {
  // Leaving an open field commits its text, as clicking away does; removing it outright re-enters its own blur handler.
  stage.querySelector<HTMLInputElement>('.type-entry')?.blur();
  const input = h('input.type-entry', { type: 'text', placeholder: t('Type, then Enter'), 'aria-label': t('Type') }) as HTMLInputElement;
  Object.assign(input.style, { left: `${screen.x}px`, top: `${screen.y - 14}px`, color: app.foreground, fontSize: `${Math.max(11, Math.min(64, app.retouch.typeSize * app.view.zoom))}px` });
  let done = false;
  const close = (commit: boolean) => {
    if (done) return;
    done = true;
    const text = input.value;
    if (input.isConnected) input.remove();
    if (commit && text.trim()) app.run('type.create', { x: Math.round(at.x), y: Math.round(at.y), text, size: app.retouch.typeSize, color: app.foreground });
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') close(true);
    else if (e.key === 'Escape') close(false);
  });
  input.addEventListener('blur', () => close(true));
  stage.append(input);
  setTimeout(() => input.focus(), 0);
}

function makeChecker(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const tile = document.createElement('canvas');
  tile.width = tile.height = 16;
  const t = tile.getContext('2d');
  if (!t) return null;
  t.fillStyle = '#ffffff';
  t.fillRect(0, 0, 16, 16);
  t.fillStyle = '#d6d6d6';
  t.fillRect(0, 0, 8, 8);
  t.fillRect(8, 8, 8, 8);
  return ctx.createPattern(tile, 'repeat');
}
