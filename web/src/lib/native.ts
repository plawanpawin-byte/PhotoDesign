// The Rust side of the pure helpers (view maths, command search, colour hex). The engine loader
// hands the wasm module over once it has started; the helpers in this folder call through it.

export interface NativeHelpers {
  view_centre(docW: number, docH: number, viewW: number, viewH: number, zoom: number): ArrayLike<number>;
  view_fit(docW: number, docH: number, viewW: number, viewH: number, margin: number): ArrayLike<number>;
  view_zoom_at(zoom: number, x: number, y: number, to: number, anchorX: number, anchorY: number): ArrayLike<number>;
  view_clamp_zoom(zoom: number): number;
  view_step_zoom(zoom: number, direction: number): number;
  view_format_zoom(zoom: number): string;
  fuzzy_score(query: string, text: string): number;
  colour_to_hex(r: number, g: number, b: number): string;
  colour_from_hex(hex: string): ArrayLike<number>;
}

let helpers: NativeHelpers | null = null;

export function useNative(pkg: NativeHelpers): void {
  helpers = pkg;
}

export function native(): NativeHelpers {
  if (!helpers) throw new Error('the Rust engine is not loaded yet');
  return helpers;
}
