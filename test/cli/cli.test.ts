import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const CLI = join(ROOT, 'src', 'cli.ts');
const TSX = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const STUB = join(ROOT, 'test', 'fixtures', 'stub-conformance.mjs');

/** Runs the CLI asynchronously so the HTTP server hosted by this test file keeps answering. */
function cli(args: string[], env: Record<string, string> = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX, CLI, ...args], { env: { ...process.env, ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

const V1_SERVER = `
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SetLevelRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => 'id' });
server.setRequestHandler(SetLevelRequestSchema, async () => ({}));
throw new McpError(-32002, 'nope');
`;

function makeV1Project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mmd-cli-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { '@modelcontextprotocol/sdk': '^1.30.0' } }));
  writeFileSync(join(dir, 'src', 'server.ts'), V1_SERVER);
  return dir;
}

describe('mcp-migrate-delta scan', () => {
  it('prints text findings and exits 1 on a 2025-11-25 server', async () => {
    const dir = makeV1Project();
    const r = await cli(['scan', dir]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('sdk-v1-package');
    expect(r.stdout).toContain('stateful-handshake');
    expect(r.stdout).toContain('removed-methods');
    expect(r.stdout).toContain('error-codes');
    expect(r.stdout).toContain('fix (safe): -32602');
    expect(r.stdout).toMatch(/4 breaking, 0 advisory/);
  });

  it('prints a JSON report with --json and writes it with --report', async () => {
    const dir = makeV1Project();
    const out = join(dir, 'scan.json');
    const r = await cli(['scan', dir, '--json', '--report', out]);
    expect(r.code).toBe(1);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.kind).toBe('scan');
    expect(parsed.reportVersion).toBe(1);
    expect(parsed.findings).toHaveLength(4);
    expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual(parsed);
  });

  it('exits 0 and says so on a clean tree', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mmd-cli-'));
    writeFileSync(join(dir, 'server.ts'), `export const ok = true;\n`);
    const r = await cli(['scan', dir]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('No finding');
    expect(r.stdout).toContain('run verify');
  });

  it('fix rewrites the safe replacement and exits 0, dry run leaves the file alone', async () => {
    const dir = makeV1Project();
    const dry = await cli(['fix', dir, '--dry-run']);
    expect(dry.code).toBe(0);
    expect(dry.stdout).toContain('would replace -32002 with -32602');
    expect(readFileSync(join(dir, 'src', 'server.ts'), 'utf8')).toContain('-32002');
    const real = await cli(['fix', dir]);
    expect(real.code).toBe(0);
    expect(real.stdout).toContain('replaced -32002 with -32602');
    expect(real.stdout).toMatch(/left for a human/);
    expect(readFileSync(join(dir, 'src', 'server.ts'), 'utf8')).toContain('-32602');
  });

  it('exits 2 with a message on a path that does not exist', async () => {
    const r = await cli(['scan', '/nonexistent/path/for/mcp-migrate-delta']);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/Cannot read/);
  });

  it('exits 2 on a usage error, never 1, so a typo cannot read as a finding', async () => {
    expect((await cli(['scan', '--jsno', '.'])).code).toBe(2);
    expect((await cli(['verify'])).code).toBe(2);
    expect((await cli(['verify', '--url', 'http://127.0.0.1:1/mcp', '--timeout', 'abc'])).code).toBe(2);
    expect((await cli(['nonexistent-command'])).code).toBe(2);
    expect((await cli(['--help'])).code).toBe(0);
    expect((await cli(['--version'])).code).toBe(0);
  });
});

describe('mcp-migrate-delta rules', () => {
  it('lists the five rules in text and JSON', async () => {
    const text = await cli(['rules']);
    expect(text.code).toBe(0);
    expect(text.stdout).toContain('sdk-v1-package');
    expect(text.stdout).toContain('[Minor 6]');
    const json = await cli(['rules', '--json']);
    const rows = JSON.parse(json.stdout);
    expect(rows.map((r: { id: string }) => r.id)).toEqual(['sdk-v1-package', 'stateful-handshake', 'removed-methods', 'resource-subscriptions', 'error-codes']);
  });
});

describe('mcp-migrate-delta verify', () => {
  let server: Server;
  let url: string;

  beforeAll(async () => {
    server = createServer((_req, res) => {
      res.statusCode = 400;
      res.end('{}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    url = `http://127.0.0.1:${address.port}/mcp`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const before = {
    scenarios: {
      'tools-list': [{ id: 'tools-list', status: 'FAILURE', errorMessage: 'Failed: Bad Request: Server not initialized' }],
      'resources-list': [{ id: 'resources-list', status: 'FAILURE', errorMessage: 'Failed: Bad Request: Server not initialized' }],
      'dns-rebinding-protection': [{ id: 'localhost-host-rebinding-rejected', status: 'SUCCESS' }],
    },
  };
  const after = {
    scenarios: {
      'tools-list': [{ id: 'tools-list', status: 'SUCCESS' }],
      'resources-list': [{ id: 'resources-list', status: 'FAILURE', errorMessage: 'Failed: Resource not found: test://static-text' }],
      'dns-rebinding-protection': [
        { id: 'localhost-host-rebinding-rejected', status: 'FAILURE', errorMessage: 'Expected HTTP 4xx for invalid Host/Origin headers, got 200' },
      ],
    },
  };

  it('writes a run report and exits 1 when scored scenarios fail', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mmd-cli-'));
    const report = join(dir, 'before.json');
    const r = await cli(['verify', '--url', url, '--report', report], {
      MCP_MIGRATE_DELTA_CONFORMANCE_BIN: STUB,
      STUB_PLAN: JSON.stringify(before),
    });
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('--requirements 2026-07-28');
    expect(r.stdout).toMatch(/Scored scenarios: 1 passed, 2 failed, 34 crashed/);
    expect(r.stdout).toContain('Root causes');
    expect(r.stdout).toContain('Bad Request: Server not initialized');
    const parsed = JSON.parse(readFileSync(report, 'utf8'));
    expect(parsed.kind).toBe('run');
    expect(parsed.conformance.version).toBe('0.2.0-alpha.11');
  });

  it('compares against a baseline, lists the regression and exits 1', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mmd-cli-'));
    const baseline = join(dir, 'before.json');
    await cli(['verify', '--url', url, '--report', baseline], { MCP_MIGRATE_DELTA_CONFORMANCE_BIN: STUB, STUB_PLAN: JSON.stringify(before) });
    const deltaFile = join(dir, 'delta.json');
    const r = await cli(['verify', '--url', url, '--baseline', baseline, '--report', deltaFile], {
      MCP_MIGRATE_DELTA_CONFORMANCE_BIN: STUB,
      STUB_PLAN: JSON.stringify(after),
    });
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('Scored scenarios failing: 36 before, 36 after');
    expect(r.stdout).toContain('Regressions:');
    expect(r.stdout).toContain('dns-rebinding-protection / localhost-host-rebinding-rejected: SUCCESS to FAILURE');
    expect(r.stdout).toContain('Verdict: regression, exit 1.');
    const delta = JSON.parse(readFileSync(deltaFile, 'utf8'));
    expect(delta.kind).toBe('delta');
    expect(delta.summary.fixed).toBe(1);
    expect(delta.summary.regressed).toBe(1);
  });

  it('exits 0 with --baseline when nothing regressed, even if failures remain', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mmd-cli-'));
    const baseline = join(dir, 'before.json');
    await cli(['verify', '--url', url, '--report', baseline], { MCP_MIGRATE_DELTA_CONFORMANCE_BIN: STUB, STUB_PLAN: JSON.stringify(before) });
    const improved = { scenarios: { ...after.scenarios, 'dns-rebinding-protection': before.scenarios['dns-rebinding-protection'] } };
    const r = await cli(['verify', '--url', url, '--baseline', baseline, '--json'], {
      MCP_MIGRATE_DELTA_CONFORMANCE_BIN: STUB,
      STUB_PLAN: JSON.stringify(improved),
    });
    expect(r.code).toBe(0);
    const delta = JSON.parse(r.stdout);
    expect(delta.summary.regressed).toBe(0);
    expect(delta.summary.fixed).toBe(1);
  });

  it('exits 2 and explains when nothing listens at the URL', async () => {
    const r = await cli(['verify', '--url', 'http://127.0.0.1:1/mcp'], { MCP_MIGRATE_DELTA_CONFORMANCE_BIN: STUB });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('No HTTP server answers');
  });

  it('refuses a baseline that is not a run report', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mmd-cli-'));
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ kind: 'scan', reportVersion: 1 }));
    const r = await cli(['verify', '--url', url, '--baseline', bad], { MCP_MIGRATE_DELTA_CONFORMANCE_BIN: STUB, STUB_PLAN: JSON.stringify(after) });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('not a run report');
  });

  it('keeps the raw suite output when --output-dir is given', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mmd-cli-'));
    const raw = join(dir, 'raw');
    const r = await cli(['verify', '--url', url, '--output-dir', raw], { MCP_MIGRATE_DELTA_CONFORMANCE_BIN: STUB, STUB_PLAN: JSON.stringify(after) });
    expect(r.code).toBe(1);
    expect(existsSync(raw)).toBe(true);
  });
});
