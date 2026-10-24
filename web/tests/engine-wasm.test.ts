// The real Rust engine, compiled to WebAssembly, driven through the TypeScript client.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EngineClient, EngineError } from '../src/engine/client';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'engine', 'pkg');
const built = existsSync(join(pkgDir, 'photodesign_wasm_bg.wasm'));

describe.skipIf(!built)('wasm engine', () => {
  async function engine(): Promise<EngineClient> {
    const pkg = await import('../src/engine/pkg/photodesign_wasm.js');
    pkg.initSync({ module: readFileSync(join(pkgDir, 'photodesign_wasm_bg.wasm')) });
    return new EngineClient(new pkg.Engine());
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
});
