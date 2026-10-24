// The canvas view: where the document sits on screen. Pure maths, no DOM.

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface View {
  /** Screen pixels per document pixel. */
  zoom: number;
  /** Screen position of the document's top-left corner, relative to the viewport. */
  x: number;
  y: number;
}

export const MIN_ZOOM = 0.01;
export const MAX_ZOOM = 64;

/** Zoom steps the +/- buttons and keys walk through. */
export const ZOOM_STEPS = [0.01, 0.02, 0.03, 0.05, 0.0833, 0.125, 0.1667, 0.25, 0.3333, 0.5, 0.6667, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** The whole document centred in the viewport, with `margin` screen pixels around it, never above 100%. */
export function fit(doc: Size, viewport: Size, margin = 48): View {
  const w = Math.max(1, viewport.width - margin * 2);
  const h = Math.max(1, viewport.height - margin * 2);
  const zoom = clampZoom(Math.min(1, w / Math.max(1, doc.width), h / Math.max(1, doc.height)));
  return centre(doc, viewport, zoom);
}

/** The document centred at `zoom`. */
export function centre(doc: Size, viewport: Size, zoom: number): View {
  const z = clampZoom(zoom);
  return { zoom: z, x: Math.round((viewport.width - doc.width * z) / 2), y: Math.round((viewport.height - doc.height * z) / 2) };
}

export function toDoc(view: View, screen: Point): Point {
  return { x: (screen.x - view.x) / view.zoom, y: (screen.y - view.y) / view.zoom };
}

export function toScreen(view: View, doc: Point): Point {
  return { x: doc.x * view.zoom + view.x, y: doc.y * view.zoom + view.y };
}

/** Zoom to `zoom`, keeping the document point under `anchor` (screen) where it is. */
export function zoomAt(view: View, zoom: number, anchor: Point): View {
  const z = clampZoom(zoom);
  const d = toDoc(view, anchor);
  return { zoom: z, x: anchor.x - d.x * z, y: anchor.y - d.y * z };
}

/** The next zoom step in `direction` (+1 in, -1 out) from `zoom`. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((s) => s > zoom * 1.001) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((s) => s < zoom / 1.001) ?? MIN_ZOOM;
}

export function pan(view: View, dx: number, dy: number): View {
  return { ...view, x: view.x + dx, y: view.y + dy };
}

export function formatZoom(zoom: number): string {
  const pct = zoom * 100;
  return `${pct >= 10 ? Math.round(pct) : Number(pct.toFixed(1))}%`;
}
