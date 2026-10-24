// The real Rust engine, compiled to WebAssembly, driven through the TypeScript client.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { EngineClient, EngineError, loadScriptFonts } from '../src/engine/client';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'engine', 'pkg');
const built = existsSync(join(pkgDir, 'photodesign_wasm_bg.wasm'));

describe.skipIf(!built)('wasm engine', () => {
  async function engine(): Promise<EngineClient> {
    const pkg = await import('../src/engine/pkg/photodesign_wasm.js');
    pkg.initSync({ module: readFileSync(join(pkgDir, 'photodesign_wasm_bg.wasm')) });
    return new EngineClient(new pkg.Engine(), pkg);
  }

  it('creates, paints, undoes and exports', async () => {
    const e = await engine();
    expect(e.state().document).toBeNull();
    expect(e.revision()).toBe(-1);
    e.execute('file.new', { width: 32, height: 16, background: 'white' });
    const doc = e.state().document!;
    expect([doc.width, doc.height]).toEqual([32, 16]);
    expect(doc.layers[0]?.name).toBe('Background');
    e.execute('paint.stroke', { points: [[2, 8], [30, 8]], size: 6, hardness: 1, color: '#000000' });
    let frame = e.render(64);
    expect([frame.width, frame.height]).toEqual([32, 16]);
    expect(frame.pixels[(8 * 32 + 16) * 4]).toBeLessThan(40);
    expect(e.state().document!.canUndo).toBe(true);
    e.execute('edit.undo');
    frame = e.render(64);
    expect(frame.pixels[(8 * 32 + 16) * 4]).toBe(255);
    const png = e.export('png');
    expect([...png.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    e.open('copy.png', png);
    expect(e.state().session.documents).toHaveLength(2);
  });

  it('lists hundreds of commands and reports errors as EngineError', async () => {
    const e = await engine();
    const commands = e.commands();
    expect(commands.length).toBeGreaterThan(500);
    expect(commands.find((c) => c.id === 'filter.blur.gaussianBlur')?.enabled).toBe(false);
    expect(() => e.execute('filter.blur.gaussianBlur', { radius: 2 })).toThrow(EngineError);
    expect(() => e.execute('no.such.command')).toThrow(/unknown command/);
    expect(() => e.render(10)).toThrow();
  });

  it('previews an adjustment and reports a histogram in Rust', async () => {
    const e = await engine();
    const white = new Uint8Array(4 * 4).fill(255);
    const inverted = e.preview('image.adjustments.invert', {}, white, 2, 2, 1);
    expect([...inverted.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    expect([...e.preview('file.new', {}, white, 2, 2, 1)]).toEqual([...white]);
    const bins = e.histogram(white);
    expect(bins).toHaveLength(1024);
    expect(bins[255]).toBe(4);
  });

  it('sets Thai text in a fetched font instead of empty boxes', async () => {
    const e = await engine();
    const thai = 'สวัสดีชาวโลก';
    const draw = () => {
      e.execute('file.new', { width: 360, height: 90, background: 'white' });
      e.execute('type.create', { x: 10, y: 60, text: thai, size: 40, color: '#000000' });
      return e.render(360).pixels;
    };
    const boxes = draw();
    const font = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fonts', 'NotoSansThai-Regular.ttf'));
    const names = await loadScriptFonts(e, async () => new Uint8Array(font));
    expect(names).toContain('Noto Sans Thai');
    const real = draw();
    expect(Buffer.from(real).equals(Buffer.from(boxes))).toBe(false);
    // The missing-glyph box is a heavy filled block; real Thai glyphs are thin strokes, so far less ink.
    const dark = (px: Uint8Array) => px.reduce((n, v, i) => (i % 4 === 0 && v < 128 ? n + 1 : n), 0);
    expect(dark(real)).toBeLessThan(dark(boxes) * 0.7);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await loadScriptFonts(e, async () => { throw new Error('offline'); })).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
