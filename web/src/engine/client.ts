import type { CommandInfo, EngineApi, EngineState, Frame } from './types';

/** The free functions the wasm package exports next to the engine class. */
export interface RawImaging {
  preview_pixels(command: string, values: string, rgba: Uint8Array, width: number, height: number, scale: number): Uint8Array;
  tone_histogram(rgba: Uint8Array): Uint32Array;
}

/** The generated wasm-bindgen class, as far as the client uses it. */
interface RawEngine {
  execute(id: string, params: string): string;
  open(name: string, bytes: Uint8Array): string;
  state(): string;
  commands(): string;
  revision(): number;
  render(maxSide: number): { width: number; height: number; pixels(): Uint8Array; free(): void };
  export(nameOrExt: string): Uint8Array;
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

  open(name: string, bytes: Uint8Array): unknown {
    try {
      return JSON.parse(this.raw.open(name, bytes));
    } catch (e) {
      throw new EngineError('open', message(e));
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

/** Loads the WebAssembly engine (built by `npm run engine`). */
export async function loadEngine(): Promise<EngineClient> {
  const pkg = await import('./pkg/photodesign_wasm.js');
  await pkg.default();
  return new EngineClient(new pkg.Engine(), pkg);
}
