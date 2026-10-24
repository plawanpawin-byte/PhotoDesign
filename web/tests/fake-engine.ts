// A small in-memory stand-in for the wasm engine, for interface tests.
import type { CommandInfo, DocumentInfo, EngineApi, EngineState, Frame } from '../src/engine/types';

export class FakeEngine implements EngineApi {
  calls: [string, Record<string, unknown>][] = [];
  doc: DocumentInfo | null = null;
  fg = [0, 0, 0, 1];
  bg = [1, 1, 1, 1];
  rev = 0;
  failNext: string | null = null;
  /** The path a shape layer or the work path holds, in the engine's own form. */
  path: { subpaths: { closed: boolean; knots: { anchor: number[]; in: number[]; out: number[]; smooth: boolean }[]; op: string }[] } | null = null;

  execute(id: string, params: Record<string, unknown> = {}): unknown {
    this.calls.push([id, params]);
    if (this.failNext) {
      const m = this.failNext;
      this.failNext = null;
      throw new Error(m);
    }
    this.rev++;
    switch (id) {
      case 'file.new':
        this.doc = { name: String(params.name ?? 'Untitled-1'), path: null, width: Number(params.width), height: Number(params.height), mode: 'Rgb', depth: 8, resolution: 72, activeLayer: 1, selectedLayers: [1], hasSelection: false, selectionBounds: null, layers: [{ id: 1, name: 'Background', kind: 'Pixel', visible: true, opacity: 1, fill: 1, blend: 'Normal', clipped: false, hasMask: false, selected: true, bounds: null }], history: ['New'], canUndo: false, canRedo: false, revision: this.rev };
        return { document: 0 };
      case 'layer.new.layer':
        if (!this.doc) throw new Error('no document');
        this.doc.layers.unshift({ id: 2, name: 'Layer 1', kind: 'Pixel', visible: true, opacity: 1, fill: 1, blend: 'Normal', clipped: false, hasMask: false, selected: true, bounds: null });
        this.doc.activeLayer = 2;
        this.doc.history.push('New Layer');
        this.doc.canUndo = true;
        return {};
      case 'shape.create': {
        if (!this.doc) throw new Error('no document');
        const p = params.path as { subpaths: { closed: boolean; knots: (number[] | { anchor: number[]; in: number[]; out: number[] })[] }[] } | undefined;
        if (params.kind === 'path' && p) {
          this.path = { subpaths: p.subpaths.map((s) => ({ closed: s.closed, op: 'combine', knots: s.knots.map((k) => (Array.isArray(k) ? { anchor: k, in: k, out: k, smooth: false } : { ...k, smooth: true })) })) };
          this.doc.layers.unshift({ id: 2, name: 'Shape 1', kind: 'Shape', visible: true, opacity: 1, fill: 1, blend: 'Normal', clipped: false, hasMask: false, selected: true, bounds: null });
          this.doc.activeLayer = 2;
        }
        return {};
      }
      case 'path.info':
        if (!this.path) throw new Error('there is no path');
        return { name: params.name, path: structuredClone(this.path) };
      case 'path.addAnchor':
        return { name: params.name, path: this.path, anchor: { subpath: params.subpath, knot: Number(params.knot) + 1 } };
      case 'path.moveAnchors':
      case 'path.moveHandle':
      case 'path.bendSegment':
      case 'path.convertPoint':
      case 'path.deleteAnchor':
        return { name: params.name, path: this.path };
      case 'tools.setColors':
        if (typeof params.foreground === 'string') this.fg = hex(params.foreground);
        if (typeof params.background === 'string') this.bg = hex(params.background);
        return {};
      default:
        if (this.doc) this.doc.history.push(id);
        return {};
    }
  }
  open(name: string, _bytes?: Uint8Array, path?: string): unknown {
    if (path) this.paths.set(name, path);
    return this.execute('file.new', { name, width: 10, height: 10 });
  }
  paths = new Map<string, string>();
  writeBackPath(): string {
    const path = this.doc ? this.paths.get(this.doc.name) : undefined;
    if (!path) throw new Error('document has no path; pass `path`');
    return path;
  }
  exportFiles(kind: 'layers' | 'dataSets', params: Record<string, unknown> = {}) {
    this.calls.push([`exportFiles.${kind}`, params]);
    return [{ name: 'a-01.png', bytes: new Uint8Array([1, 2]) }, { name: 'a-02.png', bytes: new Uint8Array([3]) }];
  }
  importDataSets(text: string, params: Record<string, unknown> = {}): unknown {
    this.calls.push(['importDataSets', { text, ...params }]);
    return { imported: 2 };
  }
  place(name: string, _bytes: Uint8Array, params: Record<string, unknown> = {}): unknown {
    this.calls.push(['file.placeEmbedded', { name, ...params }]);
    return { layer: 1 };
  }
  state(): EngineState {
    return {
      session: { active: this.doc ? 0 : null, documents: this.doc ? [{ index: 0, name: this.doc.name, width: this.doc.width, height: this.doc.height, dirty: false, revision: this.rev, path: this.paths.get(this.doc.name) ?? null }] : [], foreground: this.fg, background: this.bg },
      document: this.doc ? structuredClone(this.doc) : null,
    };
  }
  commands(): CommandInfo[] {
    return [
      { id: 'filter.blur.gaussianBlur', label: 'Gaussian Blur…', menu: ['Filter', 'Blur'], params: '{"radius":1}', enabled: !!this.doc, disabledReason: this.doc ? null : 'no open document' },
      { id: 'image.adjustments.invert', label: 'Invert', menu: ['Image', 'Adjustments'], shortcut: 'Cmd+I', params: '{}', enabled: !!this.doc },
      { id: 'file.new', label: 'New…', menu: ['File'], shortcut: 'Cmd+N', params: '{}', enabled: true },
    ];
  }
  revision(): number {
    return this.doc ? this.rev : -1;
  }
  render(maxSide: number): Frame {
    const w = Math.min(maxSide, this.doc?.width ?? 1);
    const h = Math.min(maxSide, this.doc?.height ?? 1);
    return { width: w, height: h, pixels: new Uint8Array(w * h * 4).fill(255) };
  }
  previews: string[] = [];
  preview(command: string, _values: Record<string, number>, pixels: Uint8Array): Uint8Array {
    this.previews.push(command);
    return pixels.slice();
  }
  histogram(): Uint32Array {
    return new Uint32Array(1024);
  }
  export(): Uint8Array {
    return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  }
}

function hex(s: string): number[] {
  const n = parseInt(s.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}
