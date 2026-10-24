import { describe, expect, it } from 'vitest';
import { actionFor, isTyping, nextBrushSize } from '../src/lib/keys';

describe('shortcuts', () => {
  it('maps Ctrl and ⌘ the same way', () => {
    expect(actionFor({ key: 'z', ctrlKey: true })).toBe('undo');
    expect(actionFor({ key: 'z', metaKey: true })).toBe('undo');
    expect(actionFor({ key: 'Z', ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(actionFor({ key: 'y', ctrlKey: true })).toBe('redo');
    expect(actionFor({ key: 'k', ctrlKey: true })).toBe('palette');
    expect(actionFor({ key: '0', ctrlKey: true })).toBe('zoom-fit');
  });

  it('plain keys for colours and brush size', () => {
    expect(actionFor({ key: 'x' })).toBe('swap-colors');
    expect(actionFor({ key: 'd' })).toBe('default-colors');
    expect(actionFor({ key: '[' })).toBe('brush-smaller');
    expect(actionFor({ key: ']' })).toBe('brush-larger');
    expect(actionFor({ key: 'b' })).toBeNull();
    expect(actionFor({ key: 'x', altKey: true })).toBeNull();
  });

  it('brush size steps grow with the size and stay in range', () => {
    expect(nextBrushSize(5, 1)).toBe(6);
    expect(nextBrushSize(20, 1)).toBe(25);
    expect(nextBrushSize(100, -1)).toBe(90);
    expect(nextBrushSize(1, -1)).toBe(1);
    expect(nextBrushSize(5000, 1)).toBe(5000);
  });

  it('text fields keep their keys', () => {
    const text = document.createElement('input');
    const range = document.createElement('input');
    range.type = 'range';
    expect(isTyping(text)).toBe(true);
    expect(isTyping(range)).toBe(false);
    expect(isTyping(document.createElement('textarea'))).toBe(true);
    expect(isTyping(document.body)).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});
