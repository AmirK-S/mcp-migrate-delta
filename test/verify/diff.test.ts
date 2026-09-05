import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ConformanceRunMeta, ScenarioResult } from '../../src/report.js';
import { computeDelta, deltaExitCode } from '../../src/verify/diff.js';
import { loadRequirements } from '../../src/verify/requirements.js';
import { readRunResults } from '../../src/verify/results.js';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'conformance-results');
const REQ = loadRequirements('2026-07-28');

const meta = (url: string): ConformanceRunMeta => ({
  package: '@modelcontextprotocol/conformance',
  version: '0.2.0-alpha.11',
  requirements: '2026-07-28',
  url,
  startedAt: '2026-09-05T17:48:09.000Z',
  durationMs: 550,
  exitCode: 1,
});

describe('computeDelta between the captured v1 and v2 runs', () => {
  const before = readRunResults(join(FIXTURES, 'v1-2026'), REQ);
  const after = readRunResults(join(FIXTURES, 'v2-2026'), REQ);
  const delta = computeDelta(
    { ...before, conformance: meta('http://localhost:39011/mcp') },
    { ...after, conformance: meta('http://localhost:39012/mcp') },
  );

  it('measures the strict decrease of scored failures, 36 to 27', () => {
    expect(delta.summary.scoredFailedBefore).toBe(36);
    expect(delta.summary.scoredFailedAfter).toBe(27);
  });

  it('counts 62 fixed checks and catches the one real regression of the hand migration', () => {
    expect(delta.summary.fixed).toBe(62);
    expect(delta.summary.stillFailing).toBe(29);
    expect(delta.summary.regressed).toBe(1);
    // The minimal 2026-07-28 server let an invalid Host header through; the 2025-11-25 one rejected it.
    expect(delta.changes.filter((c) => c.kind === 'regressed')).toEqual([
      {
        scenario: 'dns-rebinding-protection',
        check: 'localhost-host-rebinding-rejected',
        before: 'SUCCESS',
        after: 'FAILURE',
        kind: 'regressed',
      },
    ]);
  });

  it('lists status moves that are neither fixes nor regressions as changed', () => {
    const changed = delta.changes.filter((c) => c.kind === 'changed');
    expect(changed.map((c) => `${c.before}>${c.after}`)).not.toContain('FAILURE>SUCCESS');
    expect(changed.map((c) => `${c.before}>${c.after}`)).not.toContain('SUCCESS>FAILURE');
    expect(changed.length).toBeGreaterThan(0);
  });

  it('lists scenario outcomes side by side, only for scenarios that changed', () => {
    const toolsList = delta.scenarios.find((s) => s.scenario === 'tools-list');
    expect(toolsList).toEqual({ scenario: 'tools-list', scored: true, before: 'fail', after: 'pass' });
    const validate = delta.scenarios.find((s) => s.scenario === 'input-required-result-validate-input');
    expect(validate).toBeUndefined();
    const crashed = delta.scenarios.find((s) => s.scenario === 'tasks-capability-negotiation');
    expect(crashed?.before).toBe('crashed');
    expect(crashed?.after).toBe('fail');
  });

  it('exits 1 because one scored check regressed', () => {
    expect(deltaExitCode(delta)).toBe(1);
  });
});

describe('computeDelta on synthetic runs', () => {
  function scenario(id: string, checks: ScenarioResult['checks'], scored = true): ScenarioResult {
    const hasFailure = checks.some((c) => c.status === 'FAILURE');
    const ran = checks.some((c) => c.status === 'FAILURE' || c.status === 'SUCCESS');
    return { id, scored, outcome: hasFailure ? 'fail' : ran ? 'pass' : 'empty', checks, resultDir: `server-${id}-t` };
  }

  function run(scenarios: ScenarioResult[]) {
    return {
      conformance: meta('http://localhost:1/mcp'),
      scenarios,
      summary: {
        scored: {
          total: scenarios.filter((s) => s.scored).length,
          passed: scenarios.filter((s) => s.scored && s.outcome === 'pass').length,
          failed: scenarios.filter((s) => s.scored && s.outcome === 'fail').length,
          crashed: 0,
          empty: 0,
        },
        notScored: { total: 0, passed: 0, failed: 0, crashed: 0, empty: 0 },
        checks: { SUCCESS: 0, FAILURE: 0, WARNING: 0, SKIPPED: 0, INFO: 0 },
      },
      rootCauses: [],
    };
  }

  it('classifies every kind of change', () => {
    const before = run([
      scenario('s', [
        { id: 'fixed', status: 'FAILURE' },
        { id: 'regressed', status: 'SUCCESS' },
        { id: 'still', status: 'FAILURE' },
        { id: 'removed', status: 'SUCCESS' },
        { id: 'changed', status: 'WARNING' },
        { id: 'same', status: 'SUCCESS' },
      ]),
    ]);
    const after = run([
      scenario('s', [
        { id: 'fixed', status: 'SUCCESS' },
        { id: 'regressed', status: 'FAILURE' },
        { id: 'still', status: 'FAILURE' },
        { id: 'added', status: 'SUCCESS' },
        { id: 'changed', status: 'SKIPPED' },
        { id: 'same', status: 'SUCCESS' },
      ]),
    ]);
    const delta = computeDelta(before, after);
    expect(delta.summary).toEqual({
      scoredFailedBefore: 1,
      scoredFailedAfter: 1,
      fixed: 1,
      regressed: 1,
      stillFailing: 1,
      added: 1,
      removed: 1,
    });
    const kinds = Object.fromEntries(delta.changes.map((c) => [c.check, c.kind]));
    expect(kinds).toEqual({
      fixed: 'fixed',
      regressed: 'regressed',
      removed: 'removed',
      added: 'added',
      changed: 'changed',
    });
    expect(delta.changes.find((c) => c.check === 'removed')?.after).toBe('absent');
    expect(deltaExitCode(delta)).toBe(1);
  });

  it('treats a crashed scenario as failing on that side', () => {
    const before = run([{ id: 's', scored: true, outcome: 'crashed', checks: [] }]);
    const after = run([scenario('s', [{ id: 'x', status: 'SUCCESS' }])]);
    const delta = computeDelta(before, after);
    expect(delta.scenarios).toEqual([{ scenario: 's', scored: true, before: 'crashed', after: 'pass' }]);
    expect(delta.summary.scoredFailedBefore).toBe(1);
    expect(delta.summary.scoredFailedAfter).toBe(0);
    expect(deltaExitCode(delta)).toBe(0);
  });

  it('ignores regressions inside not scored scenarios for the exit code but still lists them', () => {
    const before = run([scenario('ext', [{ id: 'x', status: 'SUCCESS' }], false)]);
    const after = run([scenario('ext', [{ id: 'x', status: 'FAILURE' }], false)]);
    const delta = computeDelta(before, after);
    expect(delta.changes).toHaveLength(1);
    expect(delta.summary.regressed).toBe(0);
    expect(deltaExitCode(delta)).toBe(0);
  });

  it('refuses to compare runs made against different requirements', () => {
    const before = run([]);
    const after = run([]);
    after.conformance = { ...after.conformance, requirements: '2025-11-25' };
    expect(() => computeDelta(before, after)).toThrow(/requirements/);
  });
});
