'use strict';
// One-command setup: `"PhotoDesign.exe" --install-mcp` adds the MCP server to Claude Code, Codex and Antigravity.
// Each config file is merged, not replaced: other servers and settings stay as they are.
const fs = require('node:fs/promises');
const path = require('node:path');

const NAME = 'photodesign';

/** The config files of each agent, relative to the user's home folder. */
function targets(home) {
  return [
    { agent: 'Claude Code', file: path.join(home, '.claude.json'), format: 'json' },
    { agent: 'Codex', file: path.join(home, '.codex', 'config.toml'), format: 'toml' },
    // Antigravity has moved its MCP file between versions, so both places are written; the one it does not read is harmless
    { agent: 'Antigravity', file: path.join(home, '.gemini', 'config', 'mcp_config.json'), format: 'json' },
    { agent: 'Antigravity', file: path.join(home, '.gemini', 'antigravity', 'mcp_config.json'), format: 'json' },
  ];
}

/** Merge the server into a JSON config: { mcpServers: { photodesign: {command, args, env} } }. */
function mergeJson(text, entry) {
  let doc = {};
  if (text && text.trim()) {
    doc = JSON.parse(text); // throws on broken JSON: we do not overwrite a file we cannot read
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('the file is not a JSON object');
  }
  const servers = doc.mcpServers && typeof doc.mcpServers === 'object' ? doc.mcpServers : {};
  return JSON.stringify({ ...doc, mcpServers: { ...servers, [NAME]: serverJson(entry) } }, null, 2) + '\n';
}

/** The server entry as an agent reads it; env is left out when there is none. */
function serverJson(entry) {
  return entry.env ? { command: entry.command, args: entry.args, env: entry.env } : { command: entry.command, args: entry.args };
}

const tomlString = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** Replace (or add) the [mcp_servers.photodesign] table in a Codex config.toml, leaving every other line alone. */
function mergeToml(text, entry) {
  const header = `[mcp_servers.${NAME}]`;
  const envHeader = `[mcp_servers.${NAME}.env]`;
  const blockLines = [header, `command = ${tomlString(entry.command)}`, `args = [${entry.args.map(tomlString).join(', ')}]`];
  if (entry.env) blockLines.push('', envHeader, ...Object.entries(entry.env).map(([k, v]) => `${k} = ${tomlString(v)}`));
  const block = blockLines.join('\n') + '\n';
  const lines = (text || '').split(/\r?\n/);
  const out = [];
  let skipping = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('[')) skipping = t === header || t === envHeader;
    if (!skipping) out.push(line);
  }
  const kept = out.join('\n').replace(/\s+$/, '');
  return (kept ? kept + '\n\n' : '') + block;
}

/** The text of the file after merging; `format` says which merge to use. */
function merged(text, entry, format) {
  return format === 'toml' ? mergeToml(text, entry) : mergeJson(text, entry);
}

/**
 * Add the server to every agent config under `home`. Returns one line per file: written, or why it was skipped.
 * `entry` is the command an agent runs to start the server, for example {command: 'photodesign-cli', args: ['mcp', '--bridge', ...]}.
 */
async function installMcp({ home, entry }) {
  const report = [];
  for (const t of targets(home)) {
    let text = '';
    let existed = true;
    try {
      text = await fs.readFile(t.file, 'utf8');
    } catch {
      existed = false;
    }
    // a file that does not exist yet is created only for an agent whose folder already exists, so we do not create clutter
    if (!existed && !(await dirExists(path.dirname(t.file)))) {
      report.push({ agent: t.agent, file: t.file, status: 'skipped', reason: 'not installed' });
      continue;
    }
    try {
      const next = merged(text, entry, t.format);
      await fs.mkdir(path.dirname(t.file), { recursive: true });
      if (existed) await fs.copyFile(t.file, t.file + '.bak');
      await fs.writeFile(t.file, next, 'utf8');
      report.push({ agent: t.agent, file: t.file, status: 'written' });
    } catch (e) {
      report.push({ agent: t.agent, file: t.file, status: 'failed', reason: String(e && e.message ? e.message : e) });
    }
  }
  return report;
}

async function dirExists(p) {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

module.exports = { installMcp, mergeJson, mergeToml, targets, NAME };
