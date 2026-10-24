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
}
