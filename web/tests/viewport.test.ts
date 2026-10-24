import { describe, expect, it } from 'vitest';
import { centre, clampZoom, fit, formatZoom, MAX_ZOOM, MIN_ZOOM, pan, stepZoom, toDoc, toScreen, zoomAt } from '../src/lib/viewport';

describe('viewport', () => {
  it('fits a large document inside the margins and centres it', () => {
    const v = fit({ width: 4000, height: 2000 }, { width: 1000, height: 800 }, 50);
    expect(v.zoom).toBeCloseTo(900 / 4000);
    expect(v.x).toBe(50);
    expect(v.y).toBe(Math.round((800 - 2000 * v.zoom) / 2));
  });

  it('never fits above 100%', () => {
    expect(fit({ width: 10, height: 10 }, { width: 1000, height: 1000 }).zoom).toBe(1);
  });

  it('maps screen and document points both ways', () => {
    const v = { zoom: 2, x: 30, y: -10 };
    const d = toDoc(v, { x: 50, y: 10 });
    expect(d).toEqual({ x: 10, y: 10 });
    expect(toScreen(v, d)).toEqual({ x: 50, y: 10 });
  });

  it('zooming keeps the anchor point still', () => {
    const v = { zoom: 1, x: 100, y: 50 };
    const anchor = { x: 300, y: 200 };
    const before = toDoc(v, anchor);
    const after = zoomAt(v, 4, anchor);
    expect(toDoc(after, anchor).x).toBeCloseTo(before.x);
    expect(toDoc(after, anchor).y).toBeCloseTo(before.y);
  });

  it('steps through zoom levels and stops at the ends', () => {
    expect(stepZoom(1, 1)).toBe(1.5);
    expect(stepZoom(1, -1)).toBe(0.6667);
    expect(stepZoom(0.7, 1)).toBe(1);
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
  });

  it('clamps nonsense zooms', () => {
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(-3)).toBe(1);
    expect(clampZoom(1e9)).toBe(MAX_ZOOM);
    expect(clampZoom(1e-9)).toBe(MIN_ZOOM);
  });

  it('pans and centres', () => {
    expect(pan({ zoom: 1, x: 0, y: 0 }, 5, -3)).toEqual({ zoom: 1, x: 5, y: -3 });
    expect(centre({ width: 100, height: 50 }, { width: 300, height: 150 }, 1)).toEqual({ zoom: 1, x: 100, y: 50 });
  });

  it('formats zoom like people read it', () => {
    expect(formatZoom(1)).toBe('100%');
    expect(formatZoom(0.25)).toBe('25%');
    expect(formatZoom(0.0833)).toBe('8.3%');
  });
});
