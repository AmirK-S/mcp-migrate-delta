import {
  REPORT_VERSION,
  TOOL_NAME,
  type CheckChange,
  type CheckChangeKind,
  type CheckStatus,
  type DeltaReport,
  type DeltaSummary,
  type ScenarioChange,
  type ScenarioResult,
} from '../report.js';
import { TOOL_VERSION } from '../version.js';
import type { RunWithMeta } from './results.js';

/**
 * Compares two conformance runs check by check.
 *
 * Only scored scenarios feed the summary and the exit code; changes inside not scored
 * scenarios are listed for information. A `crashed` scenario counts as failing on its side.
 */
export function computeDelta(before: RunWithMeta, after: RunWithMeta): DeltaReport {
  if (before.conformance.requirements !== after.conformance.requirements) {
    throw new Error(
      `Cannot compare runs made against different requirements: ${before.conformance.requirements} and ${after.conformance.requirements}`,
    );
  }

  const beforeById = new Map(before.scenarios.map((s) => [s.id, s]));
  const afterById = new Map(after.scenarios.map((s) => [s.id, s]));
  const ids = [...new Set([...beforeById.keys(), ...afterById.keys()])];

  const summary: DeltaSummary = {
    scoredFailedBefore: countScoredFailing(before.scenarios),
    scoredFailedAfter: countScoredFailing(after.scenarios),
    fixed: 0,
    regressed: 0,
    stillFailing: 0,
    added: 0,
    removed: 0,
  };
  const scenarios: ScenarioChange[] = [];
  const changes: CheckChange[] = [];

  for (const id of ids) {
    const b = beforeById.get(id);
    const a = afterById.get(id);
    const scored = (a ?? b)!.scored;
    const beforeOutcome = b?.outcome ?? 'absent';
    const afterOutcome = a?.outcome ?? 'absent';
    if (beforeOutcome !== afterOutcome) scenarios.push({ scenario: id, scored, before: beforeOutcome, after: afterOutcome });

    const beforeChecks = indexChecks(b);
    const afterChecks = indexChecks(a);
    const keys = [...new Set([...beforeChecks.keys(), ...afterChecks.keys()])];
    for (const key of keys) {
      const bs = beforeChecks.get(key);
      const as = afterChecks.get(key);
      const kind = classify(bs, as);
      if (kind === 'still-failing') {
        if (scored) summary.stillFailing += 1;
        continue;
      }
      if (kind === null) continue;
      changes.push({ scenario: id, check: checkName(key), before: bs ?? 'absent', after: as ?? 'absent', kind });
      if (scored && kind !== 'changed') summary[kind] += 1;
    }
  }

  return {
    reportVersion: REPORT_VERSION,
    kind: 'delta',
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    baseline: before.conformance,
    current: after.conformance,
    summary,
    scenarios,
    changes,
  };
}

/** 1 when at least one check of a scored scenario regressed, 0 otherwise. */
export function deltaExitCode(delta: DeltaReport): 0 | 1 {
  return delta.summary.regressed > 0 ? 1 : 0;
}

function countScoredFailing(scenarios: ScenarioResult[]): number {
  return scenarios.filter((s) => s.scored && (s.outcome === 'fail' || s.outcome === 'crashed')).length;
}

/** Keys checks by id, disambiguating repeated ids with an occurrence index. */
function indexChecks(scenario: ScenarioResult | undefined): Map<string, CheckStatus> {
  const map = new Map<string, CheckStatus>();
  if (!scenario) return map;
  const seen = new Map<string, number>();
  for (const c of scenario.checks) {
    const n = seen.get(c.id) ?? 0;
    seen.set(c.id, n + 1);
    map.set(n === 0 ? c.id : `${c.id}#${n}`, c.status);
  }
  return map;
}

function checkName(key: string): string {
  return key;
}

function classify(before: CheckStatus | undefined, after: CheckStatus | undefined): CheckChangeKind | 'still-failing' | null {
  if (before === undefined && after === undefined) return null;
  if (before === undefined) return 'added';
  if (after === undefined) return 'removed';
  if (before === after) return before === 'FAILURE' ? 'still-failing' : null;
  if (before === 'FAILURE' && after === 'SUCCESS') return 'fixed';
  if (before === 'SUCCESS' && after === 'FAILURE') return 'regressed';
  return 'changed';
}
