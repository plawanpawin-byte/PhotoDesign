// The tools and which one is in hand. One tool at a time: holding Space (or Alt over a paint tool)
// puts the selected tool down and picks up another until the key is released.

export type ToolId = 'hand' | 'zoom' | 'brush' | 'eraser' | 'fill' | 'eyedropper' | 'marquee' | 'ellipse' | 'lasso' | 'wand' | 'gradient' | 'crop';

export interface ToolDef {
  id: ToolId;
  label: string;
  key: string;
  hint: string;
  cursor: string;
}

export const TOOLS: readonly ToolDef[] = [
  { id: 'brush', label: 'Brush', key: 'B', hint: 'Paint with the foreground colour', cursor: 'none' },
  { id: 'eraser', label: 'Eraser', key: 'E', hint: 'Erase to transparency', cursor: 'none' },
  { id: 'fill', label: 'Fill', key: 'F', hint: 'Fill similar colours with the foreground', cursor: 'crosshair' },
  { id: 'gradient', label: 'Gradient', key: 'G', hint: 'Drag from the start to the end of the gradient', cursor: 'crosshair' },
  { id: 'marquee', label: 'Marquee', key: 'M', hint: 'Drag to select a rectangle', cursor: 'crosshair' },
  { id: 'ellipse', label: 'Ellipse', key: 'O', hint: 'Drag to select an ellipse', cursor: 'crosshair' },
  { id: 'lasso', label: 'Lasso', key: 'L', hint: 'Draw around an area to select it', cursor: 'crosshair' },
  { id: 'wand', label: 'Magic wand', key: 'W', hint: 'Click to select similar colours', cursor: 'crosshair' },
  { id: 'crop', label: 'Crop', key: 'C', hint: 'Drag the area to keep, then Apply', cursor: 'crosshair' },
  { id: 'eyedropper', label: 'Pick colour', key: 'I', hint: 'Pick a colour from the image', cursor: 'crosshair' },
  { id: 'hand', label: 'Pan', key: 'H', hint: 'Drag to move around · hold Space', cursor: 'grab' },
  { id: 'zoom', label: 'Zoom', key: 'Z', hint: 'Click to zoom in, Alt-click to zoom out', cursor: 'zoom-in' },
];

export function toolByKey(key: string): ToolDef | undefined {
  const k = key.toUpperCase();
  return TOOLS.find((t) => t.key === k);
}

export function toolDef(id: ToolId): ToolDef {
  return TOOLS.find((t) => t.id === id) ?? TOOLS[0]!;
}

const PAINTS: readonly ToolId[] = ['brush', 'eraser', 'fill'];

export class ToolHand {
  private selectedTool: ToolId;
  private heldTool: ToolId | null = null;
  private heldBy: string | null = null;
  private listeners = new Set<() => void>();

  constructor(initial: ToolId = 'brush') {
    this.selectedTool = initial;
  }

  /** The tool the user picked. */
  get selected(): ToolId {
    return this.selectedTool;
  }

  /** The tool in effect now: a held tool replaces the selected one, never adds to it. */
  get active(): ToolId {
    return this.heldTool ?? this.selectedTool;
  }

  get isTemporary(): boolean {
    return this.heldTool !== null;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  /** Picks `id` up and puts any held tool down. */
  select(id: ToolId) {
    if (this.selectedTool === id && !this.heldTool) return;
    this.selectedTool = id;
    this.heldTool = null;
    this.heldBy = null;
    this.emit();
  }

  /** A held key: Space → Pan, Alt over a paint tool → Pick colour. Returns whether it took effect. */
  hold(key: string, busy = false): boolean {
    if (busy || this.heldTool) return false;
    let tool: ToolId | null = null;
    if (key === ' ' || key === 'Space') tool = 'hand';
    else if (key === 'Alt' && PAINTS.includes(this.selectedTool)) tool = 'eyedropper';
    if (!tool || tool === this.selectedTool) return false;
    this.heldTool = tool;
    this.heldBy = key === 'Space' ? ' ' : key;
    this.emit();
    return true;
  }

  /** The held key was released: the held tool goes back and the selected one returns. */
  release(key: string) {
    const k = key === 'Space' ? ' ' : key;
    if (this.heldTool && this.heldBy === k) {
      this.heldTool = null;
      this.heldBy = null;
      this.emit();
    }
  }

  /** Window lost focus: nothing stays held. */
  releaseAll() {
    if (this.heldTool) {
      this.heldTool = null;
      this.heldBy = null;
      this.emit();
    }
  }
}
