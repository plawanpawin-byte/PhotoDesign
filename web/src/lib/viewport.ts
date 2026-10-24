import { native } from './native';

// The canvas view: where the document sits on screen. The maths itself is in Rust.

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

const view = (v: ArrayLike<number>): View => ({ zoom: v[0]!, x: v[1]!, y: v[2]! });

export function clampZoom(zoom: number): number {
  return native().view_clamp_zoom(zoom);
}

/** The whole document centred in the viewport, with `margin` screen pixels around it, never above 100%. */
export function fit(doc: Size, viewport: Size, margin = 48): View {
  return view(native().view_fit(doc.width, doc.height, viewport.width, viewport.height, margin));
}

/** The document centred at `zoom`. */
export function centre(doc: Size, viewport: Size, zoom: number): View {
  return view(native().view_centre(doc.width, doc.height, viewport.width, viewport.height, zoom));
}

export function toDoc(view: View, screen: Point): Point {
  return { x: (screen.x - view.x) / view.zoom, y: (screen.y - view.y) / view.zoom };
}

export function toScreen(view: View, doc: Point): Point {
  return { x: doc.x * view.zoom + view.x, y: doc.y * view.zoom + view.y };
}

/** Zoom to `zoom`, keeping the document point under `anchor` (screen) where it is. */
export function zoomAt(current: View, zoom: number, anchor: Point): View {
  return view(native().view_zoom_at(current.zoom, current.x, current.y, zoom, anchor.x, anchor.y));
}

/** The next zoom step in `direction` (+1 in, -1 out) from `zoom`. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  return native().view_step_zoom(zoom, direction);
}

export function pan(view: View, dx: number, dy: number): View {
  return { ...view, x: view.x + dx, y: view.y + dy };
}

export function formatZoom(zoom: number): string {
  return native().view_format_zoom(zoom);
}
