// Per-pixel colour adjustments on RGBA bytes. The engine stays the source of truth when a change
// is applied; these give the sliders an instant preview and let auto tone be worked out here.
import { clipPoints, histogram } from './histogram';

export type Pixels = Uint8ClampedArray;

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

function each(px: Pixels, fn: (r: number, g: number, b: number) => [number, number, number]) {
  for (let i = 0; i + 3 < px.length; i += 4) {
    const [r, g, b] = fn(px[i]!, px[i + 1]!, px[i + 2]!);
    px[i] = clamp(r);
    px[i + 1] = clamp(g);
    px[i + 2] = clamp(b);
  }
}

export function brightnessContrast(px: Pixels, brightness: number, contrast: number) {
  const k = (259 * (contrast * 2.55 + 255)) / (255 * (259 - contrast * 2.55));
  const shift = brightness * 1.2;
  each(px, (r, g, b) => [k * (r - 128) + 128 + shift, k * (g - 128) + 128 + shift, k * (b - 128) + 128 + shift]);
}

export function exposureGamma(px: Pixels, stops: number, gamma: number) {
  const gain = 2 ** stops;
  const inv = 1 / Math.max(0.01, gamma);
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = clamp(255 * Math.pow(Math.min(1, (i / 255) * gain), inv));
  each(px, (r, g, b) => [lut[r]!, lut[g]!, lut[b]!]);
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p);
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

export function hueSaturation(px: Pixels, hue: number, saturation: number, lightness: number) {
  const sat = 1 + saturation / 100;
  const light = lightness / 100;
  each(px, (r, g, b) => {
    const [h, s, l] = rgbToHsl(r, g, b);
    const l2 = light >= 0 ? l + (1 - l) * light : l * (1 + light);
    return hslToRgb(h + hue, Math.min(1, Math.max(0, s * sat)), l2);
  });
}

/** Raises saturation of dull colours more than vivid ones. */
export function vibrance(px: Pixels, amount: number) {
  const a = amount / 100;
  each(px, (r, g, b) => {
    const [h, s, l] = rgbToHsl(r, g, b);
    const boost = a >= 0 ? a * (1 - s) : a * s;
    return hslToRgb(h, Math.min(1, Math.max(0, s + boost * s + (a >= 0 ? boost * 0.5 : 0))), l);
  });
}

export function invert(px: Pixels) {
  each(px, (r, g, b) => [255 - r, 255 - g, 255 - b]);
}

export function desaturate(px: Pixels) {
  each(px, (r, g, b) => {
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return [y, y, y];
  });
}

/** Stretches each channel so the darkest and lightest 0.5% of pixels reach 0 and 255. */
export function autoLevels(px: Pixels) {
  const hist = histogram(px);
  const ch = [clipPoints(hist.r), clipPoints(hist.g), clipPoints(hist.b)];
  const lut = ch.map((c) => {
    const t = new Uint8ClampedArray(256);
    const span = Math.max(1, c.high - c.low);
    for (let i = 0; i < 256; i++) t[i] = clamp(((i - c.low) * 255) / span);
    return t;
  });
  each(px, (r, g, b) => [lut[0]![r]!, lut[1]![g]!, lut[2]![b]!]);
}
