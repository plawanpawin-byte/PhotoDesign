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

  it('plays pointer events through the active tool', async () => {
    const { app, engine } = setup();
    await call(app, 'engine.execute', { command: 'file.new', params: { width: 100, height: 100 } });
    await call(app, 'ui.set', { tool: 'brush' });
    await call(app, 'ui.pointer', { events: [{ kind: 'down', x: 10, y: 10 }, { kind: 'move', x: 50, y: 50 }, { kind: 'up', x: 60, y: 60 }] });
    const stroke = engine.calls.find(([id]) => id === 'paint.stroke');
    expect(stroke?.[1].points).toBeDefined();
    await expect(call(app, 'ui.pointer', { events: [{ kind: 'press', x: 1, y: 1 }] })).rejects.toThrow(/kind/);
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
