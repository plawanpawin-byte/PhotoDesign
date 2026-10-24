// The window's half of the control channel (docs/control-protocol.md): the desktop host forwards
// authenticated requests from AI agents (the MCP server in crates/automation) here, and they run
// on the same engine and canvas as the user's own clicks.
import type { App } from './app';
import { clampZoom, toScreen, zoomAt } from './lib/viewport';
import { TOOLS, type ToolId } from './tools/tools';

export interface ControlRequest {
  method: string;
  params: Record<string, any>;
}

/** What the desktop host's preload exposes; absent in a plain browser tab. */
interface Host {
  onControl(handler: (req: ControlRequest) => Promise<unknown>): void;
}

interface PointerStep {
  kind: 'down' | 'move' | 'up';
  x: number;
  y: number;
  pressure?: number;
  tiltX?: number;
  tiltY?: number;
}

const MODIFIERS = ['shift', 'alt', 'command', 'ctrl', 'space'] as const;
const SET_FIELDS = ['tool', 'zoom', 'fit', 'center', 'brushSize', 'brushHardness', 'brushOpacity', 'brushFlow', 'selectionMode'];
const SELECTION_MODES = ['replace', 'add', 'subtract', 'intersect'] as const;

function encode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function decode(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function fail(message: string): never {
  throw new Error(message);
}

function object(value: unknown, what: string): Record<string, any> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) fail(`${what}: params must be a JSON object`);
  return value as Record<string, any>;
}

/** The UI state an agent sees: the engine's session and document, plus the tool and view. */
function inspect(app: App) {
  return {
    app: 'PhotoDesign',
    tool: app.tools.active,
    tools: TOOLS.map((t) => t.id),
    view: { zoom: app.view.zoom, x: app.view.x, y: app.view.y, viewport: app.viewport },
    brush: app.brush,
    selectionMode: app.select.mode,
    foreground: app.foreground,
    background: app.background,
    session: app.state.session,
    document: app.state.document,
  };
}

function setUi(app: App, p: Record<string, any>) {
  for (const k of Object.keys(p)) if (!SET_FIELDS.includes(k)) fail(`ui.set: unknown field \`${k}\` (accepted: ${SET_FIELDS.join(', ')})`);
  if (p.tool !== undefined) {
    if (!TOOLS.some((t) => t.id === p.tool)) fail(`ui.set: unknown tool \`${p.tool}\``);
    app.tools.select(p.tool as ToolId);
  }
  if (p.brushSize !== undefined) {
    if (typeof p.brushSize !== 'number' || p.brushSize < 1 || p.brushSize > 5000) fail('ui.set: brushSize must be a number 1..5000');
    app.setBrush({ size: p.brushSize });
  }
  // Hardness, opacity and flow are percentages, as the options bar shows them.
  for (const [field, key] of [['brushHardness', 'hardness'], ['brushOpacity', 'opacity'], ['brushFlow', 'flow']] as const) {
    if (p[field] === undefined) continue;
    if (typeof p[field] !== 'number' || p[field] < 0 || p[field] > 100) fail(`ui.set: ${field} must be a number 0..100 (percent)`);
    app.setBrush({ [key]: p[field] / 100 });
  }
  if (p.selectionMode !== undefined) {
    const mode = typeof p.selectionMode === 'number' ? SELECTION_MODES[p.selectionMode] : p.selectionMode;
    if (!SELECTION_MODES.includes(mode)) fail('ui.set: selectionMode is 0..3 or replace|add|subtract|intersect');
    app.setSelect({ mode });
  }
  if (p.fit) app.fitView();
  if (p.zoom !== undefined) {
    if (typeof p.zoom !== 'number' || !(p.zoom > 0)) fail('ui.set: zoom must be a positive number (1 = 100%)');
    app.setView(zoomAt(app.view, clampZoom(p.zoom), { x: app.viewport.width / 2, y: app.viewport.height / 2 }));
  }
  if (p.center !== undefined) {
    if (!Array.isArray(p.center) || p.center.length !== 2) fail('ui.set: center is [x, y] in document pixels');
    const z = app.view.zoom;
    app.setView({ zoom: z, x: app.viewport.width / 2 - Number(p.center[0]) * z, y: app.viewport.height / 2 - Number(p.center[1]) * z });
  }
  return inspect(app);
}

/** Plays pointer events on the canvas, in document coordinates, so the active tool reacts as to a real pointer. */
async function pointer(app: App, p: Record<string, any>) {
  const canvas = document.querySelector<HTMLCanvasElement>('canvas.stage-canvas') ?? fail('ui.pointer: no canvas');
  if (!app.doc) fail('ui.pointer: no document is open');
  if (p.tool !== undefined) setUi(app, { tool: p.tool });
  const events = (Array.isArray(p.events) ? p.events : fail('ui.pointer: events must be an array')) as PointerStep[];
  if (!events.length) fail('ui.pointer: events is empty');
  const mods = object(p.modifiers ?? Object.fromEntries(MODIFIERS.filter((m) => m in p).map((m) => [m, p[m]])), 'ui.pointer');
  events.forEach((e, i) => {
    if (!['down', 'move', 'up'].includes(e.kind)) fail(`ui.pointer: events[${i}].kind must be down, move or up`);
    if (typeof e.x !== 'number' || typeof e.y !== 'number') fail(`ui.pointer: events[${i}] needs numeric x and y`);
    if (e.pressure !== undefined && (e.pressure < 0 || e.pressure > 1)) fail(`ui.pointer: events[${i}].pressure is 0..1`);
  });
  const before = app.engine.revision();
  const rect = canvas.getBoundingClientRect();
  const pen = events.some((e) => e.pressure !== undefined);
  // Test environments without PointerEvent get mouse events of the same type.
  const Pointer = (typeof PointerEvent === 'function' ? PointerEvent : MouseEvent) as typeof PointerEvent;
  // A real pointer arrives where it is released before releasing: an `up` away from the last point moves there first.
  const steps: PointerStep[] = [];
  for (const e of events) {
    const last = steps.at(-1);
    if (e.kind === 'up' && last && (last.x !== e.x || last.y !== e.y)) steps.push({ ...e, kind: 'move' });
    steps.push(e);
  }
  for (const e of steps) {
    const s = toScreen(app.view, { x: e.x, y: e.y });
    const type = e.kind === 'down' ? 'pointerdown' : e.kind === 'move' ? 'pointermove' : 'pointerup';
    canvas.dispatchEvent(
      new Pointer(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 77,
        pointerType: pen ? 'pen' : 'mouse',
        button: e.kind === 'move' ? -1 : 0,
        buttons: e.kind === 'up' ? 0 : 1,
        clientX: rect.left + s.x,
        clientY: rect.top + s.y,
        pressure: e.pressure ?? (e.kind === 'up' ? 0 : 0.5),
        tiltX: e.tiltX ?? 0,
        tiltY: e.tiltY ?? 0,
        shiftKey: !!mods.shift,
        altKey: !!mods.alt,
        ctrlKey: !!mods.ctrl,
        metaKey: !!mods.command,
      }),
    );
  }
  return { tool: app.tools.active, changed: app.engine.revision() !== before, document: app.state.document };
}

/** Runs one control request. Throws with a message an agent can act on. */
export async function handleControl(app: App, req: ControlRequest): Promise<unknown> {
  const p = object(req.params, req.method);
  switch (req.method) {
    case 'ui.inspect':
      return inspect(app);
    case 'engine.commands':
      return app.engine.commands();
    case 'ui.menu.list':
      // The menu tree is the commands' own menu paths, so it lists everything a menu can run.
      return { items: app.engine.commands().map((c) => ({ id: c.id, label: c.label, menu: c.menu, shortcut: c.shortcut ?? null, enabled: c.enabled, disabledReason: c.disabledReason ?? null })) };
    case 'engine.execute':
    case 'ui.menu.invoke': {
      const id = String(p.command ?? p.id ?? fail(`${req.method}: \`command\` is required`));
      const result = app.engine.execute(id, object(p.params, id));
      app.preview = null;
      app.refresh();
      return result ?? null;
    }
    case 'engine.batch': {
      const steps = Array.isArray(p.steps) ? p.steps : fail('engine.batch: steps must be an array');
      const results: unknown[] = [];
      for (const s of steps) {
        try {
          results.push({ ok: true, result: app.engine.execute(String(s.command), object(s.params, String(s.command))) ?? null });
        } catch (e) {
          results.push({ ok: false, error: e instanceof Error ? e.message : String(e) });
          if (p.stopOnError !== false) break;
        }
      }
      app.refresh();
      return { results };
    }
    case 'ui.set':
      return setUi(app, p);
    case 'ui.pointer':
      return pointer(app, p);
    case 'app.openBytes': {
      const name = String(p.name ?? fail('app.openBytes: name is required'));
      const result = app.engine.open(name, decode(String(p.base64 ?? '')));
      app.refresh();
      return result ?? null;
    }
    case 'app.placeBytes': {
      if (!app.doc) fail('doc_place: no document is open (create or open one first)');
      const name = String(p.name ?? fail('app.placeBytes: name is required'));
      const { name: _n, base64, ...options } = p;
      const result = app.engine.place(name, decode(String(base64 ?? '')), options);
      app.refresh();
      return result ?? null;
    }
    case 'app.exportBytes': {
      if (!app.doc) fail('app.save: no document is open');
      return { base64: encode(app.engine.export(String(p.format ?? 'png'))), name: app.doc.name };
    }
    case 'jobs.list':
      return { running: [], finished: [] };
    case 'jobs.cancel':
      return { cancelled: [] };
    default:
      fail(`unknown method \`${req.method}\``);
  }
}

/** Connects the window to the desktop host's control channel, if there is one. */
export function attachControl(app: App) {
  const host = (window as unknown as { photodesignHost?: Host }).photodesignHost;
  host?.onControl((req) => handleControl(app, req));
}
