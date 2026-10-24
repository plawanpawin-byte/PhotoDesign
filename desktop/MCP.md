# AI agents (MCP)

Claude, Codex, Cursor, Antigravity and other MCP clients can drive PhotoDesign: open and save
files, run any of the engine's ~900 commands (every tool, filter, adjustment, layer and selection
command), paint and select with the tools by pointer events, and see the window.

Two parts:

- **The control channel** in the desktop app (`control.cjs`, `web/src/control.ts`): a loopback
  TCP server on `127.0.0.1:7878` speaking the JSON-lines [control protocol](../docs/control-protocol.md).
  Every connection must first send the token from `~/.photodesign/control.token` (created,
  owner-only, on first start). Requests run in the open window, so you see what the agent does
  and Undo works as usual.
- **The MCP server** `photodesign-cli` (the engine's own `crates/automation`, built from
  `apps/photocraft-cli`). Run with `mcp --bridge 127.0.0.1:7878 --control-token-file <token file>`
  it forwards to the window. Run with just `mcp` it works headless, without the app, on files.

Agents read and write files only inside the automation folder, `Documents/PhotoDesign` (set another
with `PHOTODESIGN_AUTOMATION_ROOT`). Paths are relative to it; absolute paths and `..` are refused.

## Set up

The installed app ships the MCP server in `resources/bin`. From source, build it once:

```
cd desktop
npm run cli
```

Then in PhotoDesign open **Help › Connect AI agents (MCP)…**: it shows the exact configuration for
your machine, with Copy buttons, for:

- **Claude Desktop, Cursor, Antigravity**: the `mcpServers` JSON block
- **Claude Code**: `claude mcp add photodesign -- <cli> mcp --bridge 127.0.0.1:7878 --control-token-file <token file>`
- **Codex**: a `[mcp_servers.photodesign]` block for `~/.codex/config.toml`

Keep PhotoDesign open while the agent works.

## Tools the agent gets

| MCP tool | What it does |
| --- | --- |
| `command_list` | every engine command with its params and whether it is enabled |
| `command_run` / `command_batch` | run commands by id, e.g. `filter.blur.gaussianBlur {radius: 4}`, `image.adjustments.levels`, `select.subject`, `paint.stroke {points, size, color}`, `layer.new` |
| `ui_inspect` / `session_list` | current tool, view, colours, open documents, layer tree, history, selection |
| `ui_set` | pick a tool (`tool`), brush size, selection mode, zoom, fit, centre |
| `ui_pointer` | press, drag and release with the active tool in document pixels (pressure for a pen) |
| `doc_open` / `doc_save` / `doc_export` | open and save files in the automation folder (format from the extension) |
| `ui_screenshot` / `doc_preview` | a PNG of the window |
| `control_call` | any control method directly |

## Settings

| Environment variable | Default |
| --- | --- |
| `PHOTODESIGN_CONTROL` | on; `0` turns the channel off |
| `PHOTODESIGN_CONTROL_PORT` | `7878` |
| `PHOTODESIGN_CONTROL_TOKEN_FILE` | `~/.photodesign/control.token` |
| `PHOTODESIGN_AUTOMATION_ROOT` | `Documents/PhotoDesign` |
