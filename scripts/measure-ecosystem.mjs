#!/usr/bin/env node
// Ecosystem measurement: which public MCP servers speak revision 2026-07-28?
//
// Reads a selection file (JSON array of { name, version, url, updatedAt, source }), sends at
// most two POST requests per server (server/discover for 2026-07-28, then initialize for
// 2025-11-25 if needed), never a tools/call, one pass, no retry, a fifteen second timeout
// and a five second pause between requests and between servers, sequentially, with a
// User-Agent that names this project. Writes a JSON report and a
// Markdown table next to it. Run `npm run build` first.
//
//   node scripts/measure-ecosystem.mjs <selection.json> <out-dir>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { probeServer } from '../dist/ecosystem/probe.js';
import { TOOL_VERSION } from '../dist/version.js';

const [selectionPath, outDir] = process.argv.slice(2);
if (!selectionPath || !outDir) {
  console.error('usage: node scripts/measure-ecosystem.mjs <selection.json> <out-dir>');
  process.exit(2);
}

const selection = JSON.parse(readFileSync(selectionPath, 'utf8'));
if (!Array.isArray(selection)) throw new Error('selection must be a JSON array');
mkdirSync(outDir, { recursive: true });

const date = new Date().toISOString().slice(0, 10);
const results = [];
for (const entry of selection) {
  process.stderr.write(`${entry.name} ${entry.url} ... `);
  const probe = await probeServer(entry.url, { timeoutMs: 15_000, pauseMs: 5_000 });
  process.stderr.write(`${probe.verdict} (${probe.durationMs} ms)\n`);
  results.push({ ...entry, ...probe });
  await new Promise((r) => setTimeout(r, 5_000));
}

const counts = {};
for (const r of results) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;

const report = {
  reportVersion: 1,
  kind: 'ecosystem',
  tool: { name: 'mcp-migrate-delta', version: TOOL_VERSION },
  date,
  method:
    'Per server, at most two POST requests: server/discover with the 2026-07-28 headers and _meta, then initialize (2025-11-25) when discover did not settle the verdict. No tools/call, no notifications/initialized, one pass, no retry (429 included), 15 s timeout, 5 s pause between requests and between servers, no Origin header, no credentials, identifying User-Agent, body kept to 4 KiB. A verdict records what a server declares, not that it conforms.',
  selectionFile: selectionPath,
  total: results.length,
  counts,
  servers: results,
};
writeFileSync(join(outDir, `${date}.json`), JSON.stringify(report, null, 2) + '\n');

const rows = results.map(
  (r) =>
    `| ${r.name} | ${r.version ?? ''} | ${r.url} | ${r.verdict} | ${r.protocolVersions.join(', ')} | ${r.discover.status ?? 'none'}${r.initialize ? ` / ${r.initialize.status ?? 'none'}` : ''} |`,
);
const md = [
  `# Ecosystem measurement, ${date}`,
  '',
  report.method,
  '',
  `Total: ${results.length}. ` + Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(', ') + '.',
  '',
  '| Registry name | Version | URL | Verdict | Declared versions | HTTP discover / initialize |',
  '| --- | --- | --- | --- | --- | --- |',
  ...rows,
  '',
].join('\n');
writeFileSync(join(outDir, `${date}.md`), md);
console.log(JSON.stringify({ date, total: results.length, counts }));
