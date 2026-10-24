// Colour conversions between the engine's 0..1 channels and CSS hex.

export type Rgb = [number, number, number];

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export function toHex(rgb: readonly number[]): string {
  const part = (v: number | undefined) => Math.round(clamp01(v ?? 0) * 255).toString(16).padStart(2, '0');
  return `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`;
}

/** `#rgb` or `#rrggbb` to 0..1 channels; `null` for anything else. */
export function fromHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Hex for 0..255 channels (an eyedropper sample). */
export function bytesToHex(r: number, g: number, b: number): string {
  return toHex([r / 255, g / 255, b / 255]);
}
