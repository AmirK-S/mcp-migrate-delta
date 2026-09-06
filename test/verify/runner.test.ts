import { mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { probeUrl } from '../../src/verify/probe.js';
import { runConformance, UnreachableServerError } from '../../src/verify/runner.js';

const STUB = join(import.meta.dirname, '..', 'fixtures', 'stub-conformance.mjs');

let server: Server;
let url: string;

beforeAll(async () => {
  server = createServer((_req, res) => {
    res.statusCode = 404;
    res.end('not here');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  url = `http://127.0.0.1:${address.port}/mcp`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('probeUrl', () => {
  it('treats any HTTP response as reachable, whatever the status', async () => {
    await expect(probeUrl(url, 2_000)).resolves.toEqual({ reachable: true, status: 404 });
  });

  it('falls back to a server/discover POST when the server drops GET connections', async () => {
    const picky = createServer((req, res) => {
      if (req.method === 'GET') {
        req.socket.destroy();
        return;
      }
      res.statusCode = 405;
      res.end('{}');
    });
    await new Promise<void>((resolve) => picky.listen(0, '127.0.0.1', resolve));
    const address = picky.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    try {
      await expect(probeUrl(`http://127.0.0.1:${address.port}/mcp`, 2_000)).resolves.toEqual({ reachable: true, status: 405 });
    } finally {
      await new Promise<void>((resolve) => picky.close(() => resolve()));
    }
  });

  it('reports a closed port as unreachable with the cause', async () => {
    const result = await probeUrl('http://127.0.0.1:1/mcp', 2_000);
    expect(result.reachable).toBe(false);
    expect(result.reachable === false && result.error).toMatch(/ECONNREFUSED|fetch failed/);
  });
});

describe('runConformance with a stub binary', () => {
  const plan = {
    scenarios: {
      'tools-list': [{ id: 'tools-list', status: 'SUCCESS' }],
      'tools-call-simple-text': [
        { id: 'tools-call', status: 'FAILURE', errorMessage: 'Failed: Tool test_simple_text not found' },
        { id: 'wire-schema-valid', status: 'FAILURE', errorMessage: 'Tool test_simple_text not found' },
      ],
      'tasks-lifecycle': [{ id: 'x', status: 'FAILURE', errorMessage: 'nope' }],
    },
  };

  it('passes the pinned invocation, captures the exit code and reads the results back', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'mmd-run-'));
    const run = await runConformance({
      url,
      requirements: '2026-07-28',
      outputDir,
      bin: STUB,
      env: { STUB_PLAN: JSON.stringify(plan) },
    });
    expect(run.conformance.exitCode).toBe(1);
    expect(run.conformance.requirements).toBe('2026-07-28');
    expect(run.conformance.url).toBe(url);
    expect(run.conformance.package).toBe('@modelcontextprotocol/conformance');
    expect(run.conformance.version).toBe('0.2.0-alpha.11');
    expect(run.conformance.durationMs).toBeGreaterThanOrEqual(0);
    expect(run.stdout).toContain('url=' + url + ' requirements=2026-07-28');
    expect(run.stderr).toContain('noise');
    expect(readdirSync(outputDir).filter((d) => d.startsWith('server-'))).toHaveLength(3);

    expect(run.scenarios).toHaveLength(50);
    expect(run.summary.scored.passed).toBe(1);
    expect(run.summary.scored.failed).toBe(1);
    expect(run.summary.scored.crashed).toBe(35);
    expect(run.summary.notScored.failed).toBe(1);
    expect(run.rootCauses[0]?.cause).toBe('Tool test_simple_text not found');
  });

  it('creates a temporary output directory when none is given and reports it', async () => {
    const run = await runConformance({ url, requirements: '2026-07-28', bin: STUB, env: { STUB_PLAN: JSON.stringify(plan) } });
    expect(existsSync(run.outputDir)).toBe(true);
    expect(run.outputDir).not.toBe('');
  });

  it('refuses to run against an unreachable server instead of reporting a fake regression', async () => {
    await expect(
      runConformance({ url: 'http://127.0.0.1:1/mcp', requirements: '2026-07-28', bin: STUB }),
    ).rejects.toBeInstanceOf(UnreachableServerError);
  });

  it('refuses a binary path that does not exist before spawning anything', async () => {
    await expect(
      runConformance({ url, requirements: '2026-07-28', bin: '/nonexistent/conformance.js' }),
    ).rejects.toThrow(/nonexistent/);
  });

  it('kills the suite after the timeout and reports it', async () => {
    const run = await runConformance({
      url,
      requirements: '2026-07-28',
      bin: STUB,
      env: { STUB_PLAN: JSON.stringify({ hang: true }) },
      timeoutMs: 500,
    });
    expect(run.conformance.exitCode).toBeNull();
    expect(run.timedOut).toBe(true);
  }, 10_000);

  it('rejects a revision the package does not ship before spawning anything', async () => {
    await expect(runConformance({ url, requirements: '2030-01-01', bin: STUB })).rejects.toThrow(/2030-01-01/);
  });
});
