import { describe, expect, it } from 'vitest';
import { bytesToHex, fromHex, toHex } from '../src/lib/color';

describe('colour', () => {
  it('round-trips hex', () => {
    expect(toHex([1, 0.5, 0])).toBe('#ff8000');
    expect(fromHex('#ff8000')).toEqual([1, 128 / 255, 0]);
    expect(fromHex('0f0')).toEqual([0, 1, 0]);
  });

  it('clamps and tolerates bad channels', () => {
    expect(toHex([2, -1, Number.NaN])).toBe('#ff0000');
    expect(toHex([])).toBe('#000000');
  });

  it('rejects things that are not colours', () => {
    expect(fromHex('red')).toBeNull();
    expect(fromHex('#12345')).toBeNull();
  });

  it('converts eyedropper bytes', () => {
    expect(bytesToHex(255, 255, 255)).toBe('#ffffff');
    expect(bytesToHex(16, 32, 48)).toBe('#102030');
  });
});
