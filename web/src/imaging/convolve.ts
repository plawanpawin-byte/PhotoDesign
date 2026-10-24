// Blur and sharpen on RGBA bytes. Premultiplied alpha is respected so transparent edges do not
// bleed dark fringes.
import type { Pixels } from './adjust';

export function gaussianKernel(radius: number): Float32Array {
  const sigma = Math.max(0.1, radius / 2);
  const half = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(half * 2 + 1);
  let sum = 0;
  for (let i = -half; i <= half; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + half] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i]! /= sum;
  return k;
}

function pass(src: Float32Array, dst: Float32Array, w: number, h: number, k: Float32Array, horizontal: boolean) {
  const half = (k.length - 1) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let t = -half; t <= half; t++) {
        const xx = horizontal ? Math.min(w - 1, Math.max(0, x + t)) : x;
        const yy = horizontal ? y : Math.min(h - 1, Math.max(0, y + t));
        const i = (yy * w + xx) * 4;
        const wt = k[t + half]!;
        r += src[i]! * wt; g += src[i + 1]! * wt; b += src[i + 2]! * wt; a += src[i + 3]! * wt;
      }
      const o = (y * w + x) * 4;
      dst[o] = r; dst[o + 1] = g; dst[o + 2] = b; dst[o + 3] = a;
    }
  }
}

export function gaussianBlur(px: Pixels, width: number, height: number, radius: number) {
  if (radius <= 0) return;
  const a = new Float32Array(px.length);
  for (let i = 0; i < px.length; i += 4) {
    const al = px[i + 3]! / 255;
    a[i] = px[i]! * al; a[i + 1] = px[i + 1]! * al; a[i + 2] = px[i + 2]! * al; a[i + 3] = px[i + 3]!;
  }
  const b = new Float32Array(px.length);
  const k = gaussianKernel(radius);
  pass(a, b, width, height, k, true);
  pass(b, a, width, height, k, false);
  for (let i = 0; i < px.length; i += 4) {
    const al = a[i + 3]! / 255;
    px[i] = al > 0 ? a[i]! / al : 0;
    px[i + 1] = al > 0 ? a[i + 1]! / al : 0;
    px[i + 2] = al > 0 ? a[i + 2]! / al : 0;
    px[i + 3] = a[i + 3]!;
  }
}

/** Unsharp mask: adds back `amount` percent of the difference from a blurred copy. */
export function unsharpMask(px: Pixels, width: number, height: number, amount: number, radius: number) {
  const blurred = new Uint8ClampedArray(px);
  gaussianBlur(blurred, width, height, radius);
  const k = amount / 100;
  for (let i = 0; i < px.length; i += 4) {
    for (let c = 0; c < 3; c++) px[i + c] = px[i + c]! + (px[i + c]! - blurred[i + c]!) * k;
  }
}
