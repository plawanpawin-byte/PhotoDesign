// The engine's commands grouped by their menu path, for the Menu popover.
import type { CommandInfo } from '../engine/types';

export interface MenuNode {
  name: string;
  children: MenuNode[];
  commands: CommandInfo[];
}

/** Top-level order; menus not listed here follow in the engine's order. */
export const MENU_ORDER = ['File', 'Edit', 'Image', 'Layer', 'Type', 'Select', 'Filter', 'View', 'Window', 'Help'];

export function buildMenuTree(commands: readonly CommandInfo[]): MenuNode[] {
  const root: MenuNode = { name: '', children: [], commands: [] };
  const seen = new Set<string>();
  for (const c of commands) {
    if (!c.menu?.length || seen.has(c.id)) continue;
    seen.add(c.id);
    let node = root;
    for (const part of c.menu) {
      let next = node.children.find((n) => n.name === part);
      if (!next) {
        next = { name: part, children: [], commands: [] };
        node.children.push(next);
      }
      node = next;
    }
    node.commands.push(c);
  }
  const rank = (name: string) => {
    const i = MENU_ORDER.indexOf(name);
    return i < 0 ? MENU_ORDER.length : i;
  };
  return [...root.children].sort((a, b) => rank(a.name) - rank(b.name));
}
