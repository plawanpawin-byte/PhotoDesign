import { useNative } from '../lib/native';
import type { CommandInfo, EngineApi, EngineState, ExportedFile, Frame } from './types';

/** The free functions the wasm package exports next to the engine class. */
export interface RawImaging {
  preview_pixels(command: string, values: string, rgba: Uint8Array, width: number, height: number, scale: number): Uint8Array;
  tone_histogram(rgba: Uint8Array): Uint32Array;
}

/** The generated wasm-bindgen class, as far as the client uses it. */
interface RawEngine {
  execute(id: string, params: string): string;
  open(name: string, bytes: Uint8Array, path?: string): string;
  export_files(kind: string, params: string): Uint8Array;
  import_data_sets(text: string, params: string): string;
  write_back_path(): string;
  add_font(bytes: Uint8Array, scripts: string): string;
  place(name: string, bytes: Uint8Array, params: string): string;
  state(): string;
  commands(): string;
  revision(): number;
  render(maxSide: number): { width: number; height: number; pixels(): Uint8Array; free(): void };
  export(nameOrExt: string): Uint8Array;
}

/** The engine's packed files (`u32 count`, then per file `u32 name length, name, u32 data length, data`, little-endian). */
export function unpackFiles(bytes: Uint8Array): ExportedFile[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files: ExportedFile[] = [];
  let at = 4;
  for (let i = view.getUint32(0, true); i > 0; i--) {
    const nameLength = view.getUint32(at, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 4, at + 4 + nameLength));
    at += 4 + nameLength;
    const length = view.getUint32(at, true);
    files.push({ name, bytes: bytes.slice(at + 4, at + 4 + length) });
    at += 4 + length;
  }
  return files;
}

/** An engine error, with the command that raised it. */
export class EngineError extends Error {
  constructor(
    readonly command: string,
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Typed wrapper over the wasm engine: JSON in and out, errors as {@link EngineError}. */
export class EngineClient implements EngineApi {
  constructor(
    private readonly raw: RawEngine,
    private readonly imaging: RawImaging,
  ) {}

  execute(id: string, params: Record<string, unknown> = {}): unknown {
    try {
      return JSON.parse(this.raw.execute(id, JSON.stringify(params)));
    } catch (e) {
      throw new EngineError(id, message(e));
    }
  }

  open(name: string, bytes: Uint8Array, path?: string): unknown {
    try {
      return JSON.parse(this.raw.open(name, bytes, path));
    } catch (e) {
      throw new EngineError('open', message(e));
    }
  }

  place(name: string, bytes: Uint8Array, params: Record<string, unknown> = {}): unknown {
    try {
      return JSON.parse(this.raw.place(name, bytes, JSON.stringify(params)));
    } catch (e) {
      throw new EngineError('place', message(e));
    }
  }

  exportFiles(kind: 'layers' | 'dataSets', params: Record<string, unknown> = {}): ExportedFile[] {
    try {
      return unpackFiles(this.raw.export_files(kind, JSON.stringify(params)));
    } catch (e) {
      throw new EngineError('exportFiles', message(e));
    }
  }

  /** Registers a font as the fallback for `scripts` (ISO 15924, comma-separated); returns the family names added. */
  addFont(bytes: Uint8Array, scripts: string): string[] {
    try {
      return JSON.parse(this.raw.add_font(bytes, scripts)) as string[];
    } catch (e) {
      throw new EngineError('addFont', message(e));
    }
  }

  writeBackPath(): string {
    try {
      return this.raw.write_back_path();
    } catch (e) {
      throw new EngineError('save', message(e));
    }
  }

  importDataSets(text: string, params: Record<string, unknown> = {}): unknown {
    try {
      return JSON.parse(this.raw.import_data_sets(text, JSON.stringify(params)));
    } catch (e) {
      throw new EngineError('importDataSets', message(e));
    }
  }

  state(): EngineState {
    return JSON.parse(this.raw.state()) as EngineState;
  }

  commands(): CommandInfo[] {
    return JSON.parse(this.raw.commands()) as CommandInfo[];
  }

  revision(): number {
    return this.raw.revision();
  }

  render(maxSide: number): Frame {
    const f = this.raw.render(maxSide);
    try {
      return { width: f.width, height: f.height, pixels: f.pixels() };
    } finally {
      f.free();
    }
  }

  preview(command: string, values: Record<string, number>, pixels: Uint8Array, width: number, height: number, scale: number): Uint8Array {
    try {
      return this.imaging.preview_pixels(command, JSON.stringify(values), pixels, width, height, scale);
    } catch (e) {
      throw new EngineError(command, message(e));
    }
  }

  histogram(pixels: Uint8Array): Uint32Array {
    return this.imaging.tone_histogram(pixels);
  }

  export(nameOrExt: string): Uint8Array {
    try {
      return this.raw.export(nameOrExt);
    } catch (e) {
      throw new EngineError('export', message(e));
    }
  }
}

/** Fonts the wasm has no room to embed, served next to the page (`web/public/fonts`): the fallback for their script. */
export const SCRIPT_FONTS = [{ file: 'fonts/NotoSansThai-Regular.ttf', scripts: 'Thai' }];

/** Fetches and registers the script fonts. A font that cannot be fetched is skipped (that script then shows boxes). */
export async function loadScriptFonts(engine: EngineClient, fetchBytes: (url: string) => Promise<Uint8Array> = fetchFont): Promise<string[]> {
  const added: string[] = [];
  for (const font of SCRIPT_FONTS) {
    try {
      added.push(...engine.addFont(await fetchBytes(font.file), font.scripts));
    } catch (e) {
      console.warn(`font ${font.file} not loaded:`, e);
    }
  }
  return added;
}

async function fetchFont(url: string): Promise<Uint8Array> {
  const response = await fetch(new URL(url, document.baseURI));
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Loads the WebAssembly engine (built by `npm run engine`). */
export async function loadEngine(): Promise<EngineClient> {
  const pkg = await import('./pkg/photodesign_wasm.js');
  await pkg.default();
  useNative(pkg);
  const engine = new EngineClient(new pkg.Engine(), pkg);
  await loadScriptFonts(engine);
  return engine;
}
