// Colour conversions between the engine's 0..1 channels and CSS hex (done in Rust).
import { native } from './native';

export type Rgb = [number, number, number];

export function toHex(rgb: readonly number[]): string {
  return native().colour_to_hex(rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0);
}

/** `#rgb` or `#rrggbb` to 0..1 channels; `null` for anything else. */
export function fromHex(hex: string): Rgb | null {
  const c = native().colour_from_hex(hex);
  return c.length === 3 ? [c[0]!, c[1]!, c[2]!] : null;
}

/** Hex for 0..255 channels (an eyedropper sample). */
export function bytesToHex(r: number, g: number, b: number): string {
  return toHex([r / 255, g / 255, b / 255]);
}
