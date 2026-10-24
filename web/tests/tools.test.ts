import { describe, expect, it, vi } from 'vitest';
import { GROUPS, ToolHand, TOOLS, groupCurrent, groupOf, toolByKey, toolDef } from '../src/tools/tools';

describe('one tool in hand', () => {
  it('Space puts the brush down and picks up Pan, release gives the brush back', () => {
    const t = new ToolHand('brush');
    expect(t.hold(' ')).toBe(true);
    expect(t.active).toBe('hand');
    expect(t.selected).toBe('brush');
    expect(t.isTemporary).toBe(true);
    t.release(' ');
    expect(t.active).toBe('brush');
    expect(t.isTemporary).toBe(false);
  });

  it('never stacks a second held tool on the first', () => {
    const t = new ToolHand('brush');
    t.hold(' ');
    expect(t.hold('Alt')).toBe(false);
    expect(t.active).toBe('hand');
    t.release('Alt');
    expect(t.active).toBe('hand'); // releasing a key that was not held changes nothing
    t.release(' ');
    expect(t.active).toBe('brush');
  });

  it('Alt over a paint tool picks colours, and does nothing over Pan or Zoom', () => {
    const t = new ToolHand('fill');
    expect(t.hold('Alt')).toBe(true);
    expect(t.active).toBe('eyedropper');
    t.release('Alt');
    t.select('zoom');
    expect(t.hold('Alt')).toBe(false);
    expect(t.active).toBe('zoom');
  });

  it('choosing a tool drops whatever was held', () => {
    const t = new ToolHand('brush');
    t.hold(' ');
    t.select('eraser');
    expect(t.active).toBe('eraser');
    expect(t.isTemporary).toBe(false);
    t.release(' ');
    expect(t.active).toBe('eraser');
  });

  it('holding is refused mid-stroke and when the tool is already the one', () => {
    const t = new ToolHand('hand');
    expect(t.hold(' ')).toBe(false);
    t.select('brush');
    expect(t.hold(' ', true)).toBe(false);
    expect(t.active).toBe('brush');
  });

  it('losing focus releases everything', () => {
    const t = new ToolHand('brush');
    t.hold(' ');
    t.releaseAll();
    expect(t.active).toBe('brush');
  });

  it('notifies on change only', () => {
    const t = new ToolHand('brush');
    const fn = vi.fn();
    t.onChange(fn);
    t.select('brush');
    expect(fn).not.toHaveBeenCalled();
    t.select('fill');
    t.hold(' ');
    t.release(' ');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('tools sharing a key share a slot; Shift+key cycles through it', () => {
    const slotKeys = GROUPS.map((g) => toolDef(g[0]!).key);
    expect(new Set(slotKeys).size).toBe(slotKeys.length);
    expect(GROUPS.flat()).toHaveLength(TOOLS.length);
    expect(toolByKey('b')?.id).toBe('brush');
    expect(toolByKey('b', true, 'brush')?.id).toBe('pencil');
    expect(toolByKey('o', true, 'sponge')?.id).toBe('dodge');
    expect(toolByKey('q')).toBeUndefined();
    const t = new ToolHand('brush');
    t.select('burn');
    expect(groupCurrent(groupOf('dodge'))).toBe('burn');
    expect(toolByKey('o')?.id).toBe('burn');
  });
});
