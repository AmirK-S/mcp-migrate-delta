import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRequirements } from '../../src/verify/requirements.js';
import {
  groupRootCauses,
  normaliseErrorMessage,
  parseResultDirName,
  readRunResults,
} from '../../src/verify/results.js';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'conformance-results');
const REQ = loadRequirements('2026-07-28');

describe('parseResultDirName', () => {
  it('splits the scenario id from the timestamp suffix', () => {
    expect(parseResultDirName('server-tools-list-2026-09-05T17-48-09-368Z')).toEqual({
      leg: 'server',
      scenario: 'tools-list',
      timestamp: '2026-09-05T17-48-09-368Z',
    });
  });

  it('keeps hyphens inside long scenario ids', () => {
    expect(
      parseResultDirName('server-input-required-result-validate-input-2026-09-05T17-48-09-500Z')?.scenario,
    ).toBe('input-required-result-validate-input');
  });

  it('returns null for anything else', () => {
    expect(parseResultDirName('README.md')).toBeNull();
    expect(parseResultDirName('server-tools-list')).toBeNull();
  });
});

describe('readRunResults on a captured run against a 2025-11-25 server (SDK 1.30.0)', () => {
  const run = readRunResults(join(FIXTURES, 'v1-2026'), REQ);

  it('reports every expected scenario, including the one that crashed without a directory', () => {
    expect(run.scenarios).toHaveLength(50);
    const crashed = run.scenarios.filter((s) => s.outcome === 'crashed');
    expect(crashed.map((s) => s.id)).toEqual(['tasks-capability-negotiation']);
    expect(crashed[0]?.resultDir).toBeUndefined();
  });

  it('scores 36 failures and 1 pass out of 37', () => {
    expect(run.summary.scored).toEqual({ total: 37, passed: 1, failed: 36, crashed: 0, empty: 0 });
    const passed = run.scenarios.filter((s) => s.scored && s.outcome === 'pass');
    expect(passed.map((s) => s.id)).toEqual(['input-required-result-validate-input']);
  });

  it('flags the green scenario that ran zero checks as empty', () => {
    const empty = run.scenarios.find((s) => s.id === 'tasks-status-notifications');
    expect(empty?.outcome).toBe('empty');
    expect(empty?.scored).toBe(false);
    expect(run.summary.notScored.empty).toBe(1);
  });

  it('carries the not scored reason from the requirements file', () => {
    expect(run.scenarios.find((s) => s.id === 'tasks-lifecycle')?.notScoredReason).toBe('extension');
    expect(run.scenarios.find((s) => s.id === 'tools-list')?.notScoredReason).toBeUndefined();
  });

  it('counts checks by status', () => {
    expect(run.summary.checks.FAILURE).toBeGreaterThan(100);
    expect(run.summary.checks.SUCCESS).toBeGreaterThan(0);
    const total = Object.values(run.summary.checks).reduce((a, b) => a + b, 0);
    expect(total).toBe(run.scenarios.reduce((n, s) => n + s.checks.length, 0));
  });

  it('collapses the flat oracle into one dominant root cause', () => {
    expect(run.rootCauses.length).toBeGreaterThan(0);
    const top = run.rootCauses[0]!;
    expect(top.cause).toMatch(/Server not initialized/);
    expect(top.scenarios.length).toBeGreaterThanOrEqual(30);
    expect(run.rootCauses.every((c) => !c.cause.includes('"jsonrpc"'))).toBe(true);
  });
});

describe('readRunResults on a captured run against a minimal 2026-07-28 server (server 2.0.0)', () => {
  const run = readRunResults(join(FIXTURES, 'v2-2026'), REQ);

  it('scores 27 failures and 10 passes out of 37, nothing crashed', () => {
    expect(run.summary.scored).toEqual({ total: 37, passed: 10, failed: 27, crashed: 0, empty: 0 });
  });

  it('exposes missing fixtures as the leading root causes', () => {
    const causes = run.rootCauses.map((c) => c.cause).join('\n');
    expect(causes).toMatch(/test_simple_text/);
  });
});

describe('readRunResults on synthetic directories', () => {
  function makeRun(entries: Record<string, unknown[]>): string {
    const dir = mkdtempSync(join(tmpdir(), 'mmd-results-'));
    for (const [name, checks] of Object.entries(entries)) {
      mkdirSync(join(dir, name));
      writeFileSync(join(dir, name, 'checks.json'), JSON.stringify(checks));
    }
    return dir;
  }

  const req = {
    revision: '2026-07-28',
    server: { scored: ['a', 'b'], notScored: [{ id: 'c', reason: 'pending' }], all: ['a', 'b', 'c'] },
  };

  it('marks a scenario with a single FAILURE as fail and one without as pass', () => {
    const dir = makeRun({
      'server-a-2026-01-01T00-00-00-000Z': [
        { id: 'x', status: 'SUCCESS' },
        { id: 'y', status: 'FAILURE', errorMessage: 'boom' },
      ],
      'server-b-2026-01-01T00-00-00-001Z': [{ id: 'x', status: 'SUCCESS' }, { id: 'w', status: 'WARNING' }],
    });
    const run = readRunResults(dir, req);
    expect(run.scenarios.map((s) => [s.id, s.outcome])).toEqual([
      ['a', 'fail'],
      ['b', 'pass'],
      ['c', 'crashed'],
    ]);
    expect(run.summary.scored).toEqual({ total: 2, passed: 1, failed: 1, crashed: 0, empty: 0 });
    expect(run.summary.notScored).toEqual({ total: 1, passed: 0, failed: 0, crashed: 1, empty: 0 });
  });

  it('keeps the latest directory when a scenario was run twice into the same output', () => {
    const dir = makeRun({
      'server-a-2026-01-01T00-00-00-000Z': [{ id: 'x', status: 'FAILURE' }],
      'server-a-2026-01-02T00-00-00-000Z': [{ id: 'x', status: 'SUCCESS' }],
      'server-b-2026-01-01T00-00-00-000Z': [{ id: 'x', status: 'SUCCESS' }],
      'server-c-2026-01-01T00-00-00-000Z': [{ id: 'x', status: 'SUCCESS' }],
    });
    const run = readRunResults(dir, req);
    expect(run.scenarios.find((s) => s.id === 'a')?.outcome).toBe('pass');
    expect(run.scenarios.find((s) => s.id === 'a')?.resultDir).toBe('server-a-2026-01-02T00-00-00-000Z');
  });

  it('reports a scenario the suite ran but the requirements did not list', () => {
    const dir = makeRun({
      'server-a-2026-01-01T00-00-00-000Z': [{ id: 'x', status: 'SUCCESS' }],
      'server-b-2026-01-01T00-00-00-000Z': [{ id: 'x', status: 'SUCCESS' }],
      'server-c-2026-01-01T00-00-00-000Z': [{ id: 'x', status: 'SUCCESS' }],
      'server-zzz-2026-01-01T00-00-00-000Z': [{ id: 'x', status: 'SUCCESS' }],
    });
    const run = readRunResults(dir, req);
    const extra = run.scenarios.find((s) => s.id === 'zzz');
    expect(extra?.scored).toBe(false);
    expect(extra?.notScoredReason).toBe('not-in-requirements');
  });

  it('rejects a checks.json that is not an array of checks', () => {
    const dir = makeRun({ 'server-a-2026-01-01T00-00-00-000Z': [] });
    writeFileSync(join(dir, 'server-a-2026-01-01T00-00-00-000Z', 'checks.json'), '{"nope":true}');
    expect(() => readRunResults(dir, req)).toThrow(/checks\.json/);
  });
});

describe('normaliseErrorMessage', () => {
  it('drops the raw JSON-RPC message appended after the em dash separator', () => {
    const raw =
      "[implementation] response to 'tools/list' (spec 2026-07-28): JSONRPCErrorResponse/id: must be string,integer — message: {\"jsonrpc\":\"2.0\",\"id\":null}";
    expect(normaliseErrorMessage(raw)).toBe(
      "[implementation] response to 'tools/list' (spec 2026-07-28): JSONRPCErrorResponse/id: must be string,integer",
    );
  });

  it('strips the harness prefixes so the same cause groups together', () => {
    expect(normaliseErrorMessage('Failed: Bad Request: Server not initialized')).toBe('Bad Request: Server not initialized');
    expect(normaliseErrorMessage('JSON-RPC error: Bad Request: Server not initialized')).toBe(
      'Bad Request: Server not initialized',
    );
    expect(normaliseErrorMessage('Bad Request: Server not initialized')).toBe('Bad Request: Server not initialized');
  });

  it('returns a placeholder for a failure without message', () => {
    expect(normaliseErrorMessage(undefined)).toBe('(no error message)');
  });
});

describe('groupRootCauses', () => {
  it('orders causes by number of failing checks, then by name', () => {
    const causes = groupRootCauses([
      { id: 's1', scored: true, outcome: 'fail', checks: [{ id: 'a', status: 'FAILURE', errorMessage: 'Failed: X' }] },
      {
        id: 's2',
        scored: true,
        outcome: 'fail',
        checks: [
          { id: 'a', status: 'FAILURE', errorMessage: 'X' },
          { id: 'b', status: 'FAILURE', errorMessage: 'Y' },
          { id: 'c', status: 'SUCCESS' },
        ],
      },
    ]);
    expect(causes).toEqual([
      { cause: 'X', checks: 2, scenarios: ['s1', 's2'] },
      { cause: 'Y', checks: 1, scenarios: ['s2'] },
    ]);
  });
});
