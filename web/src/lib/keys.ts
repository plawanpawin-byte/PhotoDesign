// Keyboard shortcuts → actions. Ctrl and ⌘ are the same "mod" key.

export type Action =
  | 'undo'
  | 'redo'
  | 'open'
  | 'new'
  | 'export'
  | 'palette'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-fit'
  | 'zoom-100'
  | 'swap-colors'
  | 'default-colors'
  | 'brush-smaller'
  | 'brush-larger'
  | 'escape';

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

export function actionFor(e: KeyLike): Action | null {
  const mod = !!(e.ctrlKey || e.metaKey);
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (mod) {
    if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
    if (k === 'y') return 'redo';
    if (k === 'o') return 'open';
    if (k === 'n') return 'new';
    if (k === 's' || k === 'e') return 'export';
    if (k === 'k' || k === 'p') return 'palette';
    if (k === '=' || k === '+') return 'zoom-in';
    if (k === '-') return 'zoom-out';
    if (k === '0') return 'zoom-fit';
    if (k === '1') return 'zoom-100';
    return null;
  }
  if (e.altKey) return null;
  if (k === 'x') return 'swap-colors';
  if (k === 'd') return 'default-colors';
  if (k === '[') return 'brush-smaller';
  if (k === ']') return 'brush-larger';
  if (k === 'Escape') return 'escape';
  return null;
}

/** Whether a key event came from a text field (shortcuts stay out of the way). */
export function isTyping(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return false;
  const el = target as HTMLElement;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || el.isContentEditable) return true;
  if (tag !== 'INPUT') return false;
  const type = (el as HTMLInputElement).type;
  return !['range', 'checkbox', 'radio', 'button', 'color'].includes(type);
}

/** Brush size steps for [ and ]. */
export function nextBrushSize(size: number, direction: 1 | -1): number {
  const step = size < 10 ? 1 : size < 50 ? 5 : size < 200 ? 10 : 50;
  return Math.min(5000, Math.max(1, Math.round(size + direction * step)));
}
