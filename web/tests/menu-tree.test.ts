import { describe, expect, it } from 'vitest';
import type { CommandInfo } from '../src/engine/types';
import { buildMenuTree } from '../src/lib/menu-tree';

const cmd = (id: string, menu: string[]): CommandInfo => ({ id, label: id, menu, params: '{}', enabled: true });

describe('menu tree', () => {
  it('groups by path, orders the top level and skips commands without a menu', () => {
    const tree = buildMenuTree([cmd('f.blur', ['Filter', 'Blur']), cmd('e.undo', ['Edit']), cmd('hidden', []), cmd('f.new', ['File']), cmd('f.blur2', ['Filter', 'Blur']), cmd('e.undo', ['Edit'])]);
    expect(tree.map((n) => n.name)).toEqual(['File', 'Edit', 'Filter']);
    const filter = tree[2]!;
    expect(filter.commands).toHaveLength(0);
    expect(filter.children[0]!.name).toBe('Blur');
    expect(filter.children[0]!.commands.map((c) => c.id)).toEqual(['f.blur', 'f.blur2']);
    expect(tree[1]!.commands).toHaveLength(1);
  });
});
