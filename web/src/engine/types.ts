// Shapes of the JSON the Rust engine returns (crates/engine/src/inspect.rs, commands.rs).

export interface LayerInfo {
  id: number;
  name: string;
  kind: string;
  visible: boolean;
  opacity: number;
  fill: number;
  blend: string;
  clipped: boolean;
  hasMask: boolean;
  selected: boolean;
  bounds: [number, number, number, number] | null;
  children?: LayerInfo[];
}

export interface DocumentInfo {
  name: string;
  path: string | null;
  width: number;
  height: number;
  mode: string;
  depth: number;
  resolution: number;
  activeLayer: number | null;
  selectedLayers: number[];
  hasSelection: boolean;
  /** [x, y, width, height] of the selection in document pixels. */
  selectionBounds: [number, number, number, number] | null;
  layers: LayerInfo[];
  /** Labels, oldest first; the last one is the current state. */
  history: string[];
  canUndo: boolean;
  canRedo: boolean;
  revision: number;
}

export interface SessionInfo {
  active: number | null;
  documents: { index: number; name: string; width: number; height: number; dirty: boolean; revision: number }[];
  /** Linear-ish 0..1 RGBA as the engine stores toolbox colours. */
  foreground: number[];
  background: number[];
}

export interface EngineState {
  session: SessionInfo;
  document: DocumentInfo | null;
}

export interface CommandInfo {
  id: string;
  label: string;
  menu: string[];
  shortcut?: string | null;
  params: string;
  enabled: boolean;
  disabledReason?: string | null;
  needsDocument?: boolean;
}

export interface Frame {
  width: number;
  height: number;
  pixels: Uint8Array;
}

/** What the UI needs from the engine. The wasm engine implements it; tests use a fake. */
export interface EngineApi {
  execute(id: string, params?: Record<string, unknown>): unknown;
  open(name: string, bytes: Uint8Array): unknown;
  state(): EngineState;
  commands(): CommandInfo[];
  revision(): number;
  render(maxSide: number): Frame;
  export(nameOrExt: string): Uint8Array;
  /** The frame with the adjustment `command` (slider `values`) applied, worked out in Rust. `scale` is frame pixels per document pixel. */
  preview(command: string, values: Record<string, number>, pixels: Uint8Array, width: number, height: number, scale: number): Uint8Array;
  /** 1024 counts: red, green, blue and luma bins of 256 each. */
  histogram(pixels: Uint8Array): Uint32Array;
}

/** A live, not yet applied, adjustment shown on the canvas. */
export interface Preview {
  command: string;
  values: Record<string, number>;
}
