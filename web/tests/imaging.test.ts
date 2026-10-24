import { describe, expect, it } from 'vitest';
import { autoLevels, brightnessContrast, desaturate, exposureGamma, hslToRgb, hueSaturation, invert, rgbToHsl, vibrance } from '../src/imaging/adjust';
import { gaussianBlur, gaussianKernel, unsharpMask } from '../src/imaging/convolve';
import { clipPoints, histogram, meanLuma } from '../src/imaging/histogram';
import { previewFor } from '../src/imaging/preview';

const px = (...v: number[]) => new Uint8ClampedArray(v);

describe('histogram', () => {
  it('counts channels and skips transparent pixels', () => {
    const h = histogram(px(255, 0, 0, 255, 10, 10, 10, 0));
    expect(h.count).toBe(1);
    expect(h.r[255]).toBe(1);
    expect(h.g[0]).toBe(1);
  });
  it('finds clip points and mean', () => {
    const data = new Uint8ClampedArray(400);
    for (let i = 0; i < 100; i++) data.set([50 + (i % 100), 0, 0, 255], i * 4);
    const h = histogram(data);
    const c = clipPoints(h.r, 0.05);
    expect(c.low).toBeGreaterThanOrEqual(50);
    expect(c.high).toBeLessThanOrEqual(149);
    expect(meanLuma(h)).toBeGreaterThan(0);
  });
});

describe('adjust', () => {
  it('invert is its own inverse and keeps alpha', () => {
    const p = px(10, 200, 30, 77);
    invert(p); invert(p);
    expect([...p]).toEqual([10, 200, 30, 77]);
  });
  it('zero adjustments leave pixels alone', () => {
    const p = px(100, 150, 200, 255);
    brightnessContrast(p, 0, 0);
    exposureGamma(p, 0, 1);
    hueSaturation(p, 0, 0, 0);
    expect([...p].slice(0, 3).map((v) => Math.round(v / 2))).toEqual([50, 75, 100]);
  });
  it('brightness lifts, exposure stops double', () => {
    const p = px(100, 100, 100, 255);
    brightnessContrast(p, 50, 0);
    expect(p[0]).toBeGreaterThan(100);
    const q = px(60, 60, 60, 255);
    exposureGamma(q, 1, 1);
    expect(Math.abs(q[0]! - 120)).toBeLessThanOrEqual(2);
  });
  it('desaturate gives grey; saturation -100 too', () => {
    const p = px(255, 0, 0, 255);
    desaturate(p);
    expect(p[0]).toBe(p[1]);
    const q = px(255, 0, 0, 255);
    hueSaturation(q, 0, -100, 0);
    expect(Math.abs(q[0]! - q[1]!)).toBeLessThanOrEqual(1);
  });
  it('hsl round trip', () => {
    const [h, s, l] = rgbToHsl(200, 100, 50);
    const [r, g, b] = hslToRgb(h, s, l);
    expect([r, g, b].map(Math.round)).toEqual([200, 100, 50]);
  });
  it('vibrance helps dull colours more than vivid ones', () => {
    const dull = px(130, 120, 120, 255);
    const vivid = px(255, 0, 0, 255);
    const d0 = rgbToHsl(130, 120, 120)[1];
    vibrance(dull, 80);
    vibrance(vivid, 80);
    expect(rgbToHsl(dull[0]!, dull[1]!, dull[2]!)[1]).toBeGreaterThan(d0);
    expect(vivid[0]).toBe(255);
  });
  it('auto levels stretches a flat range', () => {
    const data = new Uint8ClampedArray(4 * 50);
    for (let i = 0; i < 50; i++) data.set([100 + i, 100 + i, 100 + i, 255], i * 4);
    autoLevels(data);
    expect(Math.min(...[...data].filter((_, i) => i % 4 === 0))).toBeLessThan(10);
    expect(Math.max(...[...data].filter((_, i) => i % 4 === 0))).toBeGreaterThan(245);
  });
});

describe('convolve', () => {
  it('kernel sums to one', () => {
    expect([...gaussianKernel(3)].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });
  it('blur keeps a flat image flat and smooths an edge', () => {
    const flat = new Uint8ClampedArray(16 * 4).fill(120);
    for (let i = 3; i < flat.length; i += 4) flat[i] = 255;
    gaussianBlur(flat, 4, 4, 2);
    expect(Math.abs(flat[0]! - 120)).toBeLessThanOrEqual(1);
    const edge = new Uint8ClampedArray(8 * 4);
    for (let x = 0; x < 8; x++) edge.set([x < 4 ? 0 : 255, 0, 0, 255], x * 4);
    gaussianBlur(edge, 8, 1, 2);
    expect(edge[3 * 4]).toBeGreaterThan(0);
    expect(edge[4 * 4]).toBeLessThan(255);
  });
  it('unsharp increases edge contrast', () => {
    const edge = new Uint8ClampedArray(8 * 4);
    for (let x = 0; x < 8; x++) edge.set([x < 4 ? 80 : 160, 80, 80, 255], x * 4);
    unsharpMask(edge, 8, 1, 200, 1);
    expect(edge[3 * 4]).toBeLessThan(80);
    expect(edge[4 * 4]).toBeGreaterThan(160);
  });
});

describe('previewFor', () => {
  it('maps engine commands and returns null for unknown ones', () => {
    const fn = previewFor('image.adjustments.invert', {});
    const p = px(0, 0, 0, 255);
    fn?.(p, 1, 1, 1);
    expect(p[0]).toBe(255);
    expect(previewFor('file.new', {})).toBeNull();
  });
});
