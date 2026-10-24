import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/app';
import { FakeEngine } from './fake-engine';

describe('App', () => {
  it('creates a document and fits it to the viewport', () => {
    const engine = new FakeEngine();
    const app = new App(engine);
    app.setViewport({ width: 1000, height: 1000 });
    app.newDocument({ width: 4000, height: 2000, name: 'Big' });
    expect(engine.calls[0]).toEqual(['file.new', { width: 4000, height: 2000, background: 'white', resolution: 72, name: 'Big' }]);
    expect(app.doc?.name).toBe('Big');
    expect(app.view.zoom).toBeLessThan(1);
  });

  it('turns engine errors into a toast instead of throwing', () => {
    vi.useFakeTimers();
    const engine = new FakeEngine();
    const app = new App(engine);
    engine.failNext = 'no open document';
    expect(app.run('filter.blur.gaussianBlur', { radius: 2 })).toBeUndefined();
    expect(app.toasts.at(-1)).toMatchObject({ kind: 'error', text: expect.stringContaining('no open document') });
    vi.advanceTimersByTime(7000);
    expect(app.toasts).toHaveLength(0);
    vi.useRealTimers();
  });

  it('colours go through the engine', () => {
    const engine = new FakeEngine();
    const app = new App(engine);
    app.setForeground('#ff0000');
    expect(app.foreground).toBe('#ff0000');
    app.swapColors();
    expect(app.foreground).toBe('#ffffff');
    expect(app.background).toBe('#ff0000');
    app.defaultColors();
    expect([app.foreground, app.background]).toEqual(['#000000', '#ffffff']);
  });

  it('undo only runs when there is something to undo', () => {
    const engine = new FakeEngine();
    const app = new App(engine);
    app.newDocument({ width: 10, height: 10 });
    app.undo();
    expect(engine.calls.some(([id]) => id === 'edit.undo')).toBe(false);
    app.run('layer.new.layer');
    app.undo();
    expect(engine.calls.at(-1)?.[0]).toBe('edit.undo');
  });

  it('finds the active layer, nested or not', () => {
    const app = new App(new FakeEngine());
    expect(app.activeLayer()).toBeNull();
    app.newDocument({ width: 10, height: 10 });
    expect(app.activeLayer()?.name).toBe('Background');
    app.run('layer.new.layer');
    expect(app.activeLayer()?.name).toBe('Layer 1');
  });

  it('notifies listeners per topic', () => {
    const app = new App(new FakeEngine());
    const state = vi.fn();
    const settings = vi.fn();
    app.on('state', state);
    app.on('settings', settings);
    app.setBrush({ size: 99 });
    expect(settings).toHaveBeenCalledTimes(1);
    expect(state).not.toHaveBeenCalled();
    expect(app.brush.size).toBe(99);
  });
});
