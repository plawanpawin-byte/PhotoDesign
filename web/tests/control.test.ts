import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/app';
import { handleControl } from '../src/control';
import { mount } from '../src/main';
import { INSTALL_COMMAND, agentConfigs } from '../src/ui/overlays';
import { FakeEngine } from './fake-engine';

function setup() {
  document.body.innerHTML = '<div id="root"></div>';
  const engine = new FakeEngine();
  const app = new App(engine);
  mount(document.getElementById('root')!, app);
  return { engine, app };
}

const call = (app: App, method: string, params: Record<string, unknown> = {}) => handleControl(app, { method, params });

describe('control channel (AI agents)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('runs engine commands and reports the document', async () => {
    const { app, engine } = setup();
    await call(app, 'engine.execute', { command: 'file.new', params: { width: 64, height: 32 } });
    expect(engine.calls.at(-1)).toEqual(['file.new', { width: 64, height: 32 }]);
    const state = (await call(app, 'ui.inspect')) as { document: { width: number }; tool: string };
    expect(state.document.width).toBe(64);
    expect(state.tool).toBe('brush');
  });

  it('changes tool and brush, and refuses fields it does not know', async () => {
    const { app } = setup();
    await call(app, 'ui.set', { tool: 'dodge', brushSize: 40, selectionMode: 2 });
    expect(app.tools.active).toBe('dodge');
    expect(app.brush.size).toBe(40);
    expect(app.select.mode).toBe('subtract');
    await expect(call(app, 'ui.set', { theme: 'dark' })).rejects.toThrow(/unknown field `theme`/);
    await expect(call(app, 'ui.set', { tool: 'laser' })).rejects.toThrow(/unknown tool/);
    await expect(call(app, 'nope')).rejects.toThrow(/unknown method/);
  });

  it('lists the menu tree, sets brush percentages and places bytes', async () => {
    const { app, engine } = setup();
    const menu = (await call(app, 'ui.menu.list')) as { items: { id: string; menu: string[] }[] };
    expect(menu.items.some((i) => i.id === 'filter.blur.gaussianBlur' && i.menu[0] === 'Filter')).toBe(true);
    await call(app, 'ui.set', { brushOpacity: 40, brushFlow: 25, brushHardness: 90 });
    expect(app.brush).toMatchObject({ opacity: 0.4, flow: 0.25, hardness: 0.9 });
    await expect(call(app, 'ui.set', { brushOpacity: 140 })).rejects.toThrow(/0\.\.100/);
    await expect(call(app, 'app.placeBytes', { name: 'logo.png', base64: 'AAAA' })).rejects.toThrow(/no document/);
    await call(app, 'engine.execute', { command: 'file.new', params: { width: 50, height: 50 } });
    await call(app, 'app.placeBytes', { name: 'logo.png', base64: 'AAAA', scale: 50 });
    expect(engine.calls.at(-1)).toEqual(['file.placeEmbedded', { name: 'logo.png', scale: 50 }]);
  });

  it('exports files and imports data sets through the host, which has the file system', async () => {
    const { app, engine } = setup();
    await expect(call(app, 'app.exportFiles', { kind: 'layers' })).rejects.toThrow(/no document/);
    await call(app, 'engine.execute', { command: 'file.new', params: { width: 50, height: 50, name: 'doc' } });
    const out = (await call(app, 'app.exportFiles', { kind: 'layers', format: 'png' })) as { files: { name: string; base64: string }[] };
    expect(out.files.map((f) => f.name)).toEqual(['a-01.png', 'a-02.png']);
    expect(out.files[0]!.base64).toBe('AQI=');
    expect(engine.calls.at(-1)).toEqual(['exportFiles.layers', { format: 'png' }]);
    await call(app, 'app.exportFiles', { kind: 'dataSets' });
    expect(engine.calls.at(-1)?.[0]).toBe('exportFiles.dataSets');
    await call(app, 'app.importDataSets', { text: 'a\n1', delimiter: ';' });
    expect(engine.calls.at(-1)).toEqual(['importDataSets', { text: 'a\n1', delimiter: ';' }]);
  });

  it('keeps the path a document was opened from, so a save without a path can write back', async () => {
    const { app } = setup();
    await call(app, 'app.openBytes', { name: 'a.psd', base64: 'AAAA' });
    await expect(call(app, 'app.writeBackPath')).rejects.toThrow(/no path/);
    await call(app, 'app.openBytes', { name: 'b.psd', base64: 'AAAA', path: 'C:/Docs/b.psd' });
    expect(await call(app, 'app.writeBackPath')).toEqual({ path: 'C:/Docs/b.psd' });
  });

  it('runs wait:false commands as background jobs that jobs.cancel can stop before they start', async () => {
    const { app, engine } = setup();
    await call(app, 'engine.execute', { command: 'file.new', params: { width: 50, height: 50 } });
    const before = engine.calls.length;
    const started = (await call(app, 'engine.execute', { command: 'image.adjustments.invert', params: {}, wait: false })) as { job: number; pending: boolean };
    expect(started.pending).toBe(true);
    expect(engine.calls.length).toBe(before); // not run yet: the caller got the job id first
    expect(((await call(app, 'jobs.list')) as { jobs: { id: number; state: string }[] }).jobs).toContainEqual(expect.objectContaining({ id: started.job, state: 'running' }));
    await new Promise((r) => setTimeout(r, 450));
    expect(engine.calls.length).toBe(before + 1);
    expect(((await call(app, 'jobs.list')) as { jobs: { id: number; state: string }[] }).jobs.find((j) => j.id === started.job)?.state).toBe('done');

    const second = (await call(app, 'engine.execute', { command: 'image.adjustments.invert', wait: false })) as { job: number };
    expect(await call(app, 'jobs.cancel', { job: second.job })).toEqual({ cancelled: 1 });
    await new Promise((r) => setTimeout(r, 450));
    expect(engine.calls.length).toBe(before + 1); // the cancelled job never ran
    expect(await call(app, 'jobs.cancel', { job: started.job })).toEqual({ cancelled: 0 }); // already finished
    await expect(call(app, 'jobs.cancel', { job: 999 })).rejects.toThrow(/no job/);

    engine.failNext = 'boom';
    const bad = (await call(app, 'engine.execute', { command: 'image.adjustments.invert', wait: false })) as { job: number };
    await new Promise((r) => setTimeout(r, 450));
    const listed = ((await call(app, 'jobs.list')) as { jobs: { id: number; state: string; error?: string }[] }).jobs.find((j) => j.id === bad.job);
    expect(listed?.state).toBe('failed');
    expect(listed?.error).toBe('boom');
  });

  it('plays pointer events through the active tool', async () => {
    const { app, engine } = setup();
    await call(app, 'engine.execute', { command: 'file.new', params: { width: 100, height: 100 } });
    await call(app, 'ui.set', { tool: 'brush' });
    await call(app, 'ui.pointer', { events: [{ kind: 'down', x: 10, y: 10 }, { kind: 'move', x: 50, y: 50 }, { kind: 'up', x: 60, y: 60 }] });
    const stroke = engine.calls.find(([id]) => id === 'paint.stroke');
    expect(stroke?.[1].points).toBeDefined();
    await expect(call(app, 'ui.pointer', { events: [{ kind: 'press', x: 1, y: 1 }] })).rejects.toThrow(/kind/);
  });

  it('keeps the first Type field\'s text when a second click opens another', async () => {
    const { app, engine } = setup();
    await call(app, 'engine.execute', { command: 'file.new', params: { width: 100, height: 100 } });
    await call(app, 'ui.set', { tool: 'type' });
    await call(app, 'ui.pointer', { events: [{ kind: 'down', x: 10, y: 10 }, { kind: 'up', x: 10, y: 10 }] });
    const first = document.querySelector<HTMLInputElement>('.type-entry');
    expect(first).not.toBeNull();
    first!.focus();
    first!.value = 'Hi';
    await call(app, 'ui.pointer', { events: [{ kind: 'down', x: 50, y: 50 }, { kind: 'up', x: 50, y: 50 }] });
    expect(engine.calls.find(([id]) => id === 'type.create')?.[1]).toMatchObject({ text: 'Hi' });
    expect(document.querySelectorAll('.type-entry')).toHaveLength(1);
  });

  it('gives each AI client a configuration that starts the MCP bridge', () => {
    const configs = agentConfigs({ port: 7878, tokenFile: '/home/me/.photodesign/control.token', root: '/home/me/Documents/PhotoDesign', cli: '/opt/PhotoDesign/bin/photodesign-cli', cliFound: true });
    expect(INSTALL_COMMAND).toContain('--install-mcp');
    expect(configs.map((c) => c.name)).toHaveLength(3);
    const json = JSON.parse(configs[0]!.text);
    expect(json.mcpServers.photodesign.args).toEqual(['mcp', '--bridge', '127.0.0.1:7878', '--control-token-file', '/home/me/.photodesign/control.token']);
    expect(configs[1]!.text).toBe('claude mcp add photodesign -- /opt/PhotoDesign/bin/photodesign-cli mcp --bridge 127.0.0.1:7878 --control-token-file /home/me/.photodesign/control.token');
  });
});
