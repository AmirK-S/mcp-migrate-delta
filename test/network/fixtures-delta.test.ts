/**
 * The proof the project exists for: the pinned official conformance suite, run for real
 * against the two bundled servers, must show a strict improvement and no regression.
 *
 * Needs the network only to the extent that the fixtures' dependencies are installed;
 * the suite itself talks to localhost. Kept out of `npm test` because it starts servers.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeDelta, deltaExitCode } from '../../src/verify/diff.js';
import { probeUrl } from '../../src/verify/probe.js';
import { runConformance, toRunReport, type ConformanceRun } from '../../src/verify/runner.js';

const ROOT = join(import.meta.dirname, '..', '..');
const OUT = join(ROOT, '.mcp-migrate-delta');
const BEFORE_PORT = 39301;
const AFTER_PORT = 39302;
const REVISION = '2026-07-28';

const children: ChildProcess[] = [];

async function startFixture(name: 'before' | 'after', port: number): Promise<string> {
  const child = spawn(process.execPath, [join(ROOT, 'fixtures', name, 'src', 'server.mjs')], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
  children.push(child);
  const url = `http://localhost:${port}/mcp`;
  for (let i = 0; i < 50; i++) {
    if ((await probeUrl(url, 500)).reachable) return url;
    if (child.exitCode !== null) throw new Error(`fixture ${name} exited with ${child.exitCode}: ${stderr}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`fixture ${name} did not answer on ${url}: ${stderr}`);
}

let before: ConformanceRun;
let after: ConformanceRun;

beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  const beforeUrl = await startFixture('before', BEFORE_PORT);
  const afterUrl = await startFixture('after', AFTER_PORT);
  before = await runConformance({ url: beforeUrl, requirements: REVISION, outputDir: join(OUT, 'before') });
  after = await runConformance({ url: afterUrl, requirements: REVISION, outputDir: join(OUT, 'after') });
  writeFileSync(join(OUT, 'before.json'), JSON.stringify(toRunReport(before), null, 2));
  writeFileSync(join(OUT, 'after.json'), JSON.stringify(toRunReport(after), null, 2));
  writeFileSync(join(OUT, 'before.stdout.txt'), before.stdout);
  writeFileSync(join(OUT, 'after.stdout.txt'), after.stdout);
}, 120_000);

afterAll(() => {
  for (const child of children) child.kill('SIGTERM');
});

describe(`official conformance suite, --requirements ${REVISION}, on the bundled fixtures`, () => {
  it('runs all 50 scenarios on both sides, none crashed', () => {
    expect(before.scenarios).toHaveLength(50);
    expect(after.scenarios).toHaveLength(50);
    expect(after.summary.scored.crashed).toBe(0);
    expect(before.timedOut).toBe(false);
    expect(after.timedOut).toBe(false);
  });

  it('fails almost everything on the 2025-11-25 server, for one root cause', () => {
    expect(before.summary.scored.failed + before.summary.scored.crashed).toBeGreaterThanOrEqual(30);
    expect(before.rootCauses[0]?.cause).toMatch(/server not initialized|unsupported protocol version/i);
  });

  it('passes every scored scenario on the migrated server', () => {
    const failing = after.scenarios.filter((s) => s.scored && s.outcome !== 'pass').map((s) => s.id);
    expect(failing).toEqual([]);
    expect(after.summary.scored.passed).toBe(37);
    expect(after.conformance.exitCode).toBe(0);
  });

  it('measures a strict improvement with no regression, so verify exits 0', () => {
    const delta = computeDelta(before, after);
    writeFileSync(join(OUT, 'delta.json'), JSON.stringify(delta, null, 2));
    expect(delta.summary.scoredFailedAfter).toBeLessThan(delta.summary.scoredFailedBefore);
    expect(delta.summary.scoredFailedAfter).toBe(0);
    expect(delta.summary.regressed).toBe(0);
    expect(delta.summary.fixed).toBeGreaterThan(50);
    expect(deltaExitCode(delta)).toBe(0);
  });
});
