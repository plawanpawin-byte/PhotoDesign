import { describe, expect, it } from 'vitest';
import { rank, score } from '../src/lib/fuzzy';

const items = ['Gaussian Blur…', 'Motion Blur…', 'New Layer…', 'Rotate 90° Clockwise', 'Brightness/Contrast…', 'Blend If'];

describe('fuzzy search', () => {
  it('finds substrings first', () => {
    expect(rank(items, 'blur', (s) => s).map((m) => m.item).slice(0, 2).sort()).toEqual(['Gaussian Blur…', 'Motion Blur…']);
  });

  it('matches initials in order', () => {
    expect(score('nl', 'New Layer…')).toBeGreaterThan(0);
    expect(score('ln', 'New Layer…')).toBe(-1);
  });

  it('prefers word starts', () => {
    expect(score('rot', 'Rotate 90° Clockwise')).toBeGreaterThan(score('rot', 'Brightness/Contrast…'));
  });

  it('an empty query matches everything with no preference', () => {
    expect(score('', 'anything')).toBe(0);
    expect(rank(items, '  ', (s) => s)).toHaveLength(items.length);
  });

  it('limits the result count', () => {
    expect(rank(items, 'e', (s) => s, 2)).toHaveLength(2);
  });
});
