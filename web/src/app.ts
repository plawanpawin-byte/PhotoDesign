// The application controller: owns the engine, the view and the tool settings, and tells the
// interface when something changed. Every edit is an engine command.
import { EngineError } from './engine/client';
import { t } from './lib/i18n';
import type { CommandInfo, DocumentInfo, EngineApi, EngineState, LayerInfo } from './engine/types';
import { toHex } from './lib/color';
import { fit, type Size, type View } from './lib/viewport';
import type { PreviewFn } from './imaging/preview';
import { ToolHand } from './tools/tools';

export interface BrushSettings {
  size: number;
  hardness: number;
  opacity: number;
  flow: number;
}

export interface FillSettings {
  tolerance: number;
  contiguous: boolean;
}

export type Topic = 'state' | 'view' | 'tool' | 'settings' | 'toast' | 'crop' | 'preview';

export type SelectMode = 'replace' | 'add' | 'subtract' | 'intersect';

export interface SelectSettings {
  mode: SelectMode;
  feather: number;
}

export type GradientStyle = 'linear' | 'radial' | 'angle' | 'reflected' | 'diamond';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

export interface NewDocumentSpec {
  width: number;
  height: number;
  name?: string;
  background?: 'white' | 'black' | 'transparent';
  resolution?: number;
}

const EMPTY_STATE: EngineState = { session: { active: null, documents: [], foreground: [0, 0, 0, 1], background: [1, 1, 1, 1] }, document: null };

export class App {
  state: EngineState = EMPTY_STATE;
  view: View = { zoom: 1, x: 0, y: 0 };
  viewport: Size = { width: 800, height: 600 };
  readonly tools = new ToolHand('brush');
  brush: BrushSettings = { size: 24, hardness: 0.8, opacity: 1, flow: 1 };
  fill: FillSettings = { tolerance: 32, contiguous: true };
  select: SelectSettings = { mode: 'replace', feather: 0 };
  gradientStyle: GradientStyle = 'linear';
  /** The crop being drawn, in document pixels, until it is applied or cancelled. */
  cropRect: Rect | null = null;
  toasts: Toast[] = [];
  /** A live, not yet applied, adjustment shown on the canvas. */
  preview: PreviewFn | null = null;
  private commandCache: CommandInfo[] | null = null;
  private listeners = new Map<Topic, Set<() => void>>();
  private toastSeq = 0;
  private fittedRevisionDoc: string | null = null;

  constructor(readonly engine: EngineApi) {
    this.tools.onChange(() => this.emit('tool'));
    this.refresh();
  }

  on(topic: Topic, fn: () => void): () => void {
    let set = this.listeners.get(topic);
    if (!set) this.listeners.set(topic, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }

  /** Drops every interface listener: the interface is about to be rebuilt (language change). */
  detachUi() {
    this.listeners.clear();
  }

  emit(topic: Topic) {
    for (const fn of this.listeners.get(topic) ?? []) fn();
  }

  get doc(): DocumentInfo | null {
    return this.state.document;
  }

  get foreground(): string {
    return toHex(this.state.session.foreground);
  }

  get background(): string {
    return toHex(this.state.session.background);
  }

  /** Re-reads the engine state; fits the view when a different document became active. */
  refresh() {
    this.state = this.engine.state();
    this.commandCache = null;
    const s = this.state.session;
    const key = s.active === null ? null : `${s.active}:${s.documents[s.active]?.name ?? ''}`;
    if (key !== this.fittedRevisionDoc) {
      this.fittedRevisionDoc = key;
      if (this.doc) this.fitView();
    }
    this.emit('state');
  }

  /** Runs a command; errors become a toast. Returns the result, or `undefined` on failure. */
  run(id: string, params: Record<string, unknown> = {}): unknown {
    try {
      const result = this.engine.execute(id, params);
      this.preview = null;
      this.refresh();
      return result;
    } catch (e) {
      this.notify(e instanceof EngineError ? e.message : String(e), 'error');
      this.refresh();
      return undefined;
    }
  }

  commands(): CommandInfo[] {
    if (!this.commandCache) this.commandCache = this.engine.commands();
    return this.commandCache;
  }

  notify(text: string, kind: Toast['kind'] = 'info') {
    const toast = { id: ++this.toastSeq, text, kind };
    this.toasts = [...this.toasts.slice(-3), toast];
    this.emit('toast');
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== toast.id);
      this.emit('toast');
    }, kind === 'error' ? 6000 : 3000);
  }

  setView(view: View) {
    this.view = view;
    this.emit('view');
  }

  setViewport(size: Size) {
    this.viewport = size;
    this.emit('view');
  }

  fitView() {
    if (this.doc) this.setView(fit(this.doc, this.viewport));
  }

  setBrush(patch: Partial<BrushSettings>) {
    this.brush = { ...this.brush, ...patch };
    this.emit('settings');
  }

  setFill(patch: Partial<FillSettings>) {
    this.fill = { ...this.fill, ...patch };
    this.emit('settings');
  }

  setSelect(patch: Partial<SelectSettings>) {
    this.select = { ...this.select, ...patch };
    this.emit('settings');
  }

  setGradientStyle(style: GradientStyle) {
    this.gradientStyle = style;
    this.emit('settings');
  }

  setPreview(fn: PreviewFn | null) {
    if (!fn && !this.preview) return;
    this.preview = fn;
    this.emit('preview');
  }

  setCrop(rect: Rect | null) {
    this.cropRect = rect;
    this.emit('crop');
  }

  /** Crops the document to the pending crop rectangle. */
  applyCrop() {
    const r = this.cropRect;
    const doc = this.doc;
    if (!r || !doc) return;
    const x = Math.max(0, Math.round(r.x));
    const y = Math.max(0, Math.round(r.y));
    const width = Math.min(doc.width - x, Math.round(r.width));
    const height = Math.min(doc.height - y, Math.round(r.height));
    this.setCrop(null);
    if (width < 1 || height < 1) {
      this.notify('Nothing to crop', 'error');
      return;
    }
    this.run('image.crop', { x, y, width, height });
    this.fitView();
  }

  /** Selects a rectangle or ellipse (document pixels) with the current mode and feather. */
  selectRect(rect: Rect, ellipse: boolean) {
    this.run('select.rect', { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)), ellipse, mode: this.select.mode, feather: this.select.feather });
  }

  newDocument(spec: NewDocumentSpec) {
    this.run('file.new', { width: spec.width, height: spec.height, background: spec.background ?? 'white', resolution: spec.resolution ?? 72, ...(spec.name ? { name: spec.name } : {}) });
  }

  async openFiles(files: Iterable<File>) {
    for (const file of files) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        this.engine.open(file.name, bytes);
        this.notify(`${t('Opened')} ${file.name}`);
      } catch (e) {
        this.notify(e instanceof Error ? e.message : String(e), 'error');
      }
      this.refresh();
    }
  }

  /** Encodes the active document and hands it to the browser as a download. */
  exportAs(ext: string) {
    const doc = this.doc;
    if (!doc) return;
    try {
      const bytes = this.engine.export(ext);
      const base = doc.name.replace(/\.[^.]+$/, '') || 'Untitled';
      download(bytes, `${base}.${ext}`);
      this.notify(`${t('Exported')} ${base}.${ext}`);
    } catch (e) {
      this.notify(e instanceof Error ? e.message : String(e), 'error');
    }
  }

  setForeground(hex: string) {
    this.run('tools.setColors', { foreground: hex });
  }

  setBackground(hex: string) {
    this.run('tools.setColors', { background: hex });
  }

  swapColors() {
    this.run('tools.setColors', { foreground: this.background, background: this.foreground });
  }

  defaultColors() {
    this.run('tools.setColors', { foreground: '#000000', background: '#ffffff' });
  }

  undo() {
    if (this.doc?.canUndo) this.run('edit.undo');
  }

  redo() {
    if (this.doc?.canRedo) this.run('edit.redo');
  }

  activeLayer(): LayerInfo | null {
    const id = this.doc?.activeLayer;
    return id == null ? null : (findLayer(this.doc?.layers ?? [], id) ?? null);
  }
}

export function findLayer(layers: readonly LayerInfo[], id: number): LayerInfo | undefined {
  for (const l of layers) {
    if (l.id === id) return l;
    const inner = l.children && findLayer(l.children, id);
    if (inner) return inner;
  }
  return undefined;
}

function download(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes as BlobPart]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
