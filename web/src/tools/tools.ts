// The tools and which one is in hand. One tool at a time: holding Space (or Alt over a paint tool)
// puts the selected tool down and picks up another until the key is released.

export type ToolId =
  | 'move'
  | 'marquee' | 'ellipse'
  | 'lasso' | 'magneticLasso'
  | 'quickSelect' | 'objectSelect' | 'wand'
  | 'crop'
  | 'eyedropper'
  | 'spotHealing' | 'healing' | 'patch' | 'redEye'
  | 'brush' | 'pencil' | 'mixer' | 'colorReplace'
  | 'cloneStamp' | 'patternStamp'
  | 'historyBrush'
  | 'eraser' | 'backgroundEraser' | 'magicEraser'
  | 'gradient' | 'fill'
  | 'blur' | 'sharpen' | 'smudge'
  | 'dodge' | 'burn' | 'sponge'
  | 'pen'
  | 'type'
  | 'rectShape' | 'ellipseShape' | 'lineShape'
  | 'hand' | 'zoom';

export interface ToolDef {
  id: ToolId;
  label: string;
  key: string;
  hint: string;
  cursor: string;
}

/** Every tool, in toolbar order. Each one drives the engine's own command for it (paint.*, select.*, shape.create, type.create…). */
export const TOOLS: readonly ToolDef[] = [
  { id: 'move', label: 'Move', key: 'V', hint: 'Drag to move the layer', cursor: 'move' },
  { id: 'marquee', label: 'Rectangular Marquee', key: 'M', hint: 'Drag to select a rectangle', cursor: 'crosshair' },
  { id: 'ellipse', label: 'Elliptical Marquee', key: 'M', hint: 'Drag to select an ellipse', cursor: 'crosshair' },
  { id: 'lasso', label: 'Lasso', key: 'L', hint: 'Draw around an area to select it', cursor: 'crosshair' },
  { id: 'magneticLasso', label: 'Magnetic Lasso', key: 'L', hint: 'Trace along an edge; the outline snaps to it', cursor: 'crosshair' },
  { id: 'quickSelect', label: 'Quick Selection', key: 'W', hint: 'Paint over an area to select it', cursor: 'crosshair' },
  { id: 'objectSelect', label: 'Object Selection', key: 'W', hint: 'Drag a box around an object, or click it', cursor: 'crosshair' },
  { id: 'wand', label: 'Magic Wand', key: 'W', hint: 'Click to select similar colours', cursor: 'crosshair' },
  { id: 'crop', label: 'Crop', key: 'C', hint: 'Drag the area to keep, then Apply', cursor: 'crosshair' },
  { id: 'eyedropper', label: 'Eyedropper', key: 'I', hint: 'Pick a colour from the image', cursor: 'crosshair' },
  { id: 'spotHealing', label: 'Spot Healing Brush', key: 'J', hint: 'Paint over a blemish to remove it', cursor: 'none' },
  { id: 'healing', label: 'Healing Brush', key: 'J', hint: 'Alt-click a source, then paint to heal', cursor: 'none' },
  { id: 'patch', label: 'Patch', key: 'J', hint: 'Select an area, then drag it onto clean texture', cursor: 'crosshair' },
  { id: 'redEye', label: 'Red Eye', key: 'J', hint: 'Click a red pupil', cursor: 'crosshair' },
  { id: 'brush', label: 'Brush', key: 'B', hint: 'Paint with the foreground colour', cursor: 'none' },
  { id: 'pencil', label: 'Pencil', key: 'B', hint: 'Hard-edged strokes', cursor: 'none' },
  { id: 'mixer', label: 'Mixer Brush', key: 'B', hint: 'Paint that mixes with the colours underneath', cursor: 'none' },
  { id: 'colorReplace', label: 'Color Replacement', key: 'B', hint: 'Paint the foreground colour onto similar colours', cursor: 'none' },
  { id: 'cloneStamp', label: 'Clone Stamp', key: 'S', hint: 'Alt-click a source, then paint a copy of it', cursor: 'none' },
  { id: 'patternStamp', label: 'Pattern Stamp', key: 'S', hint: 'Paint with the current pattern', cursor: 'none' },
  { id: 'historyBrush', label: 'History Brush', key: 'Y', hint: 'Paint back an earlier state', cursor: 'none' },
  { id: 'eraser', label: 'Eraser', key: 'E', hint: 'Erase to transparency', cursor: 'none' },
  { id: 'backgroundEraser', label: 'Background Eraser', key: 'E', hint: 'Erase the colour under the brush centre', cursor: 'none' },
  { id: 'magicEraser', label: 'Magic Eraser', key: 'E', hint: 'Click to erase similar colours', cursor: 'crosshair' },
  { id: 'gradient', label: 'Gradient', key: 'G', hint: 'Drag from the start to the end of the gradient', cursor: 'crosshair' },
  { id: 'fill', label: 'Paint Bucket', key: 'G', hint: 'Fill similar colours with the foreground', cursor: 'crosshair' },
  { id: 'blur', label: 'Blur', key: 'R', hint: 'Paint to soften', cursor: 'none' },
  { id: 'sharpen', label: 'Sharpen', key: 'R', hint: 'Paint to sharpen', cursor: 'none' },
  { id: 'smudge', label: 'Smudge', key: 'R', hint: 'Drag paint along', cursor: 'none' },
  { id: 'dodge', label: 'Dodge', key: 'O', hint: 'Paint to lighten', cursor: 'none' },
  { id: 'burn', label: 'Burn', key: 'O', hint: 'Paint to darken', cursor: 'none' },
  { id: 'sponge', label: 'Sponge', key: 'O', hint: 'Paint to change saturation', cursor: 'none' },
  { id: 'pen', label: 'Pen', key: 'P', hint: 'Click to add points, drag for curves; click the first point to close', cursor: 'crosshair' },
  { id: 'type', label: 'Type', key: 'T', hint: 'Click to add text', cursor: 'text' },
  { id: 'rectShape', label: 'Rectangle', key: 'U', hint: 'Drag to draw a rectangle shape layer', cursor: 'crosshair' },
  { id: 'ellipseShape', label: 'Ellipse', key: 'U', hint: 'Drag to draw an ellipse shape layer', cursor: 'crosshair' },
  { id: 'lineShape', label: 'Line', key: 'U', hint: 'Drag to draw a line shape layer', cursor: 'crosshair' },
  { id: 'hand', label: 'Hand', key: 'H', hint: 'Drag to move around · hold Space', cursor: 'grab' },
  { id: 'zoom', label: 'Zoom', key: 'Z', hint: 'Click to zoom in, Alt-click to zoom out', cursor: 'zoom-in' },
];

/** Toolbar slots: tools sharing a shortcut share a slot, and the slot shows the one last used. */
export const GROUPS: readonly (readonly ToolId[])[] = (() => {
  const out: ToolId[][] = [];
  for (const t of TOOLS) {
    const g = out.find((grp) => toolDef(grp[0]!).key === t.key);
    if (g) g.push(t.id);
    else out.push([t.id]);
  }
  return out;
})();

/** Tools that paint along the pointer path (they show the brush circle and send a points list). */
export const STROKE_TOOLS: readonly ToolId[] = ['brush', 'pencil', 'mixer', 'colorReplace', 'eraser', 'backgroundEraser', 'cloneStamp', 'patternStamp', 'historyBrush', 'spotHealing', 'healing', 'blur', 'sharpen', 'smudge', 'dodge', 'burn', 'sponge', 'quickSelect'];

/** Last tool used in each slot, by its first tool. */
const lastInGroup = new Map<ToolId, ToolId>();

export function groupOf(id: ToolId): readonly ToolId[] {
  return GROUPS.find((g) => g.includes(id)) ?? [id];
}

/** The slot's tool to show: the one last picked from it. */
export function groupCurrent(group: readonly ToolId[]): ToolId {
  return lastInGroup.get(group[0]!) ?? group[0]!;
}

export function rememberInGroup(id: ToolId) {
  lastInGroup.set(groupOf(id)[0]!, id);
}

/** The tool a shortcut picks: the slot's current tool, or with `cycle` (Shift) the next one in the slot. */
export function toolByKey(key: string, cycle = false, current?: ToolId): ToolDef | undefined {
  const k = key.toUpperCase();
  const group = GROUPS.find((g) => toolDef(g[0]!).key === k);
  if (!group) return undefined;
  let id = groupCurrent(group);
  if (cycle && current && group.includes(current)) id = group[(group.indexOf(current) + 1) % group.length]!;
  return toolDef(id);
}

export function toolDef(id: ToolId): ToolDef {
  return TOOLS.find((t) => t.id === id) ?? TOOLS[0]!;
}

const PAINTS: readonly ToolId[] = ['brush', 'pencil', 'mixer', 'eraser', 'fill', 'gradient', 'type', 'rectShape', 'ellipseShape', 'lineShape'];

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
    rememberInGroup(id);
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
