// Tone statistics of an RGBA frame, computed in the browser for the histogram and auto tone.
export interface Histogram {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  luma: Uint32Array;
  /** Pixels counted (fully transparent ones are skipped). */
  count: number;
}

export function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function histogram(rgba: Uint8Array | Uint8ClampedArray): Histogram {
  const out: Histogram = { r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256), luma: new Uint32Array(256), count: 0 };
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue;
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    out.r[r]!++;
    out.g[g]!++;
    out.b[b]!++;
    out.luma[Math.round(luma(r, g, b))]!++;
    out.count++;
  }
  return out;
}

/** The levels where `fraction` of the pixels lie below (low) and above (high) in a channel. */
export function clipPoints(bins: Uint32Array, fraction = 0.005): { low: number; high: number } {
  let total = 0;
  for (const n of bins) total += n;
  if (total === 0) return { low: 0, high: 255 };
  const cut = total * fraction;
  let acc = 0;
  let low = 0;
  for (; low < 255; low++) {
    acc += bins[low]!;
    if (acc > cut) break;
  }
  acc = 0;
  let high = 255;
  for (; high > low; high--) {
    acc += bins[high]!;
    if (acc > cut) break;
  }
  return { low, high };
}

export function meanLuma(h: Histogram): number {
  if (h.count === 0) return 0;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * h.luma[i]!;
  return sum / h.count;
}
