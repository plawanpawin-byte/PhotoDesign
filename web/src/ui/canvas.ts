// The canvas: shows the engine's render of the active document, and turns pointer input into
// engine commands for the tool in hand.
import type { App } from '../app';
import { bytesToHex, toHex } from '../lib/color';
import { pan, stepZoom, toDoc, toScreen, zoomAt, type Point } from '../lib/viewport';
import { toolDef, type ToolId } from '../tools/tools';
import { h } from './dom';

/** Longest side the engine renders for the screen; larger documents are shown scaled. */
const RENDER_MAX = 4096;

interface Stroke {
  points: number[][];
  screen: Point[];
  erase: boolean;
}

export function canvasView(app: App): HTMLElement {
  const canvas = h('canvas.stage-canvas');
  const stage = h('div.stage', canvas);
  const ctx = canvas.getContext('2d');
  let image: HTMLCanvasElement | null = null;
  let renderedRevision = Number.NaN;
  let renderedDoc = -1;
  let pointer: Point | null = null;
  let stroke: Stroke | null = null;
  let panning: { from: Point; pointerId: number; button: number } | null = null;
  let queued = false;
  let checker: CanvasPattern | null = null;

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
      if (c) c.putImageData(new ImageData(new Uint8ClampedArray(frame.pixels.buffer as ArrayBuffer, frame.pixels.byteOffset, frame.pixels.byteLength), frame.width, frame.height), 0, 0);
      image = off;
      renderedRevision = revision;
      renderedDoc = active;
    } catch (e) {
      app.notify(e instanceof Error ? e.message : String(e), 'error');
    }
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
      ctx.drawImage(image, v.x, v.y, w, hgt);
    }
    if (stroke && stroke.screen.length) drawStrokePreview(ctx, stroke, app);
    const tool = app.tools.active;
    if (pointer && (tool === 'brush' || tool === 'eraser') && !panning) {
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
    else if (tool === 'zoom') canvas.style.cursor = 'zoom-in';
    else canvas.style.cursor = toolDef(tool).cursor;
  };

  const startPan = (e: PointerEvent) => {
    panning = { from: local(e), pointerId: e.pointerId, button: e.button };
    canvas.setPointerCapture(e.pointerId);
    updateCursor();
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
    } else if (tool === 'brush' || tool === 'eraser') {
      canvas.setPointerCapture(e.pointerId);
      stroke = { points: [], screen: [], erase: tool === 'eraser' };
      addPoint(stroke, d, p, e);
    } else if (tool === 'fill') {
      app.run('paint.bucket', { x: Math.floor(d.x), y: Math.floor(d.y), tolerance: app.fill.tolerance, contiguous: app.fill.contiguous });
    } else if (tool === 'eyedropper') {
      pick(app, d);
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
    if (stroke) {
      const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      for (const ce of events.length ? events : [e]) {
        const cp = local(ce);
        addPoint(stroke, toDoc(app.view, cp), cp, ce);
      }
    } else if (app.tools.active === 'eyedropper' && e.buttons === 1) {
      pick(app, toDoc(app.view, p));
    }
    schedule();
  });

  const finish = (e: PointerEvent) => {
    if (panning && e.pointerId === panning.pointerId) {
      panning = null;
      updateCursor();
    }
    if (stroke) {
      const s = stroke;
      stroke = null;
      if (s.points.length === 1) s.points.push([...s.points[0]!]);
      app.run('paint.stroke', {
        points: s.points,
        size: app.brush.size,
        hardness: app.brush.hardness,
        opacity: app.brush.opacity,
        flow: app.brush.flow,
        zoom: app.view.zoom,
        ...(s.erase ? { erase: true } : { color: app.foreground }),
      });
    }
    schedule();
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
  canvas.addEventListener('pointerleave', () => {
    if (!stroke && !panning) {
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
    const r = stage.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) app.setViewport({ width: Math.round(r.width), height: Math.round(r.height) });
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(stage);
  window.addEventListener('resize', resize);
  requestAnimationFrame(() => {
    resize();
    app.fitView();
  });

  app.on('state', schedule);
  app.on('view', schedule);
  app.on('settings', schedule);
  app.on('tool', () => {
    updateCursor();
    schedule();
  });
  updateCursor();
  return stage;
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
  ctx.globalAlpha = stroke.erase ? 0.55 : Math.max(0.15, app.brush.opacity);
  ctx.strokeStyle = stroke.erase ? '#d9d9d9' : app.foreground;
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

/** Screen rectangle of the document (for tests and overlays). */
export function documentRect(app: App): { x: number; y: number; width: number; height: number } | null {
  const doc = app.doc;
  if (!doc) return null;
  const tl = toScreen(app.view, { x: 0, y: 0 });
  return { x: tl.x, y: tl.y, width: doc.width * app.view.zoom, height: doc.height * app.view.zoom };
}
