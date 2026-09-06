/**
 * The ecosystem probe against the two bundled servers: the only oracle for "modern" and
 * "legacy" that does not involve anyone else's server.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { probeServer } from '../../src/ecosystem/probe.js';
import { probeUrl } from '../../src/verify/probe.js';

const ROOT = join(import.meta.dirname, '..', '..');
const children: ChildProcess[] = [];

async function startFixture(name: 'before' | 'after', port: number): Promise<string> {
  const child = spawn(process.execPath, [join(ROOT, 'fixtures', name, 'src', 'server.mjs')], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  children.push(child);
  const url = `http://localhost:${port}/mcp`;
  for (let i = 0; i < 50; i++) {
    if ((await probeUrl(url, 500)).reachable) return url;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`fixture ${name} did not answer`);
}

afterAll(() => {
  for (const child of children) child.kill('SIGTERM');
});

describe('probeServer on the bundled fixtures', () => {
  it('classifies fixtures/after as modern, from server/discover alone', async () => {
    const probe = await probeServer(await startFixture('after', 39312), { pauseMs: 0 });
    expect(probe.verdict).toBe('modern');
    expect(probe.protocolVersions).toContain('2026-07-28');
    expect(probe.initialize).toBeUndefined();
  }, 30_000);

  it('classifies fixtures/before as legacy 2025-11-25, from discover then initialize', async () => {
    const probe = await probeServer(await startFixture('before', 39311), { pauseMs: 0 });
    expect(probe.verdict).toBe('legacy');
    expect(probe.protocolVersions).toEqual(['2025-11-25']);
    expect(probe.discover.status).toBe(400);
    expect(probe.initialize?.status).toBe(200);
  }, 30_000);
});
