import { relative } from 'node:path';
import type { DeltaReport, Finding, RunReport, ScanReport } from './report.js';
import type { Rule } from './rules/types.js';

const MAX_ROOT_CAUSES = 8;

export function formatScan(report: ScanReport): string {
  const lines: string[] = [];
  lines.push(`${report.tool.name} ${report.tool.version} scan of ${displayPath(report.target.path)}`);
  lines.push(`Revision 2025-11-25 to 2026-07-28, ${report.target.files} file(s), ${report.summary.rules.length} rule(s)`);
  lines.push('');
  if (report.findings.length === 0) {
    lines.push('No finding. Nothing this scanner knows about stands in the way of 2026-07-28.');
    lines.push('That is not a proof: run verify against the official conformance suite.');
    return lines.join('\n');
  }
  let currentFile = '';
  for (const f of report.findings) {
    if (f.file !== currentFile) {
      currentFile = f.file;
      lines.push(f.file);
    }
    lines.push(formatFinding(f));
  }
  lines.push('');
  lines.push(`${report.summary.breaking} breaking, ${report.summary.advisory} advisory`);
  const safeFixes = report.findings.filter((f) => f.fix?.confidence === 'safe').length;
  if (safeFixes > 0) lines.push(`${safeFixes} finding(s) have a safe mechanical replacement, shown inline.`);
  return lines.join('\n');
}

/** The scanned path relative to the working directory when it lies beneath it, else as given. */
function displayPath(path: string): string {
  const rel = relative(process.cwd(), path);
  return rel === '' ? '.' : rel.startsWith('..') ? path : rel;
}

function formatFinding(f: Finding): string {
  const fix = f.fix ? `  fix (${f.fix.confidence}): ${f.fix.replacement}` : '';
  return [`  ${f.line}:${f.column}  ${f.severity.padEnd(8)} ${f.ruleId} [${f.section}]`, `      ${f.message}`, `      ${f.snippet}`, fix]
    .filter((l) => l !== '')
    .join('\n');
}

export function formatRun(report: RunReport): string {
  const c = report.conformance;
  const s = report.summary;
  const lines: string[] = [];
  lines.push(`${c.package}@${c.version} --requirements ${c.requirements} against ${c.url}`);
  lines.push(`${(c.durationMs / 1000).toFixed(2)} s, suite exit code ${c.exitCode ?? 'none'}`);
  lines.push('');
  lines.push(
    `Scored scenarios: ${s.scored.passed} passed, ${s.scored.failed} failed, ${s.scored.crashed} crashed, ${s.scored.empty} empty, ${s.scored.total} total`,
  );
  lines.push(
    `Not scored: ${s.notScored.passed} passed, ${s.notScored.failed} failed, ${s.notScored.crashed} crashed, ${s.notScored.empty} empty (never count)`,
  );
  lines.push(`Checks: ${s.checks.SUCCESS} success, ${s.checks.FAILURE} failure, ${s.checks.WARNING} warning, ${s.checks.SKIPPED} skipped, ${s.checks.INFO} info`);

  const failing = report.scenarios.filter((x) => x.scored && x.outcome !== 'pass');
  if (failing.length > 0) {
    lines.push('');
    lines.push('Failing scored scenarios:');
    for (const x of failing) {
      const n = x.checks.filter((k) => k.status === 'FAILURE').length;
      lines.push(`  ${x.outcome.padEnd(7)} ${x.id}${x.outcome === 'fail' ? ` (${n} failing check${n === 1 ? '' : 's'})` : ''}`);
    }
  }
  const crashed = report.scenarios.filter((x) => x.outcome === 'crashed');
  if (crashed.length > 0) {
    lines.push('');
    lines.push(`${crashed.length} scenario(s) left no checks.json; the suite crashed on them and would have counted them silently.`);
  }
  if (report.rootCauses.length > 0) {
    lines.push('');
    lines.push('Root causes, by failing checks:');
    for (const cause of report.rootCauses.slice(0, MAX_ROOT_CAUSES)) {
      lines.push(`  ${String(cause.checks).padStart(4)}  ${cause.cause}  [${cause.scenarios.length} scenario(s)]`);
    }
    if (report.rootCauses.length > MAX_ROOT_CAUSES) lines.push(`  ... ${report.rootCauses.length - MAX_ROOT_CAUSES} more in the JSON report`);
  }
  return lines.join('\n');
}

export function formatDelta(delta: DeltaReport): string {
  const s = delta.summary;
  const lines: string[] = [];
  lines.push(`Delta on --requirements ${delta.current.requirements}`);
  lines.push(`  baseline: ${delta.baseline.url} (${delta.baseline.startedAt})`);
  lines.push(`  current:  ${delta.current.url} (${delta.current.startedAt})`);
  lines.push('');
  lines.push(`Scored scenarios failing: ${s.scoredFailedBefore} before, ${s.scoredFailedAfter} after`);
  lines.push(`Checks: ${s.fixed} fixed, ${s.regressed} regressed, ${s.stillFailing} still failing, ${s.added} added, ${s.removed} removed`);
  const regressed = delta.changes.filter((c) => c.kind === 'regressed');
  if (regressed.length > 0) {
    lines.push('');
    lines.push('Regressions:');
    for (const c of regressed) lines.push(`  ${c.scenario} / ${c.check}: ${c.before} to ${c.after}`);
  }
  if (delta.scenarios.length > 0) {
    lines.push('');
    lines.push('Scenario outcomes that changed:');
    for (const c of delta.scenarios) lines.push(`  ${c.scored ? '' : '(not scored) '}${c.scenario}: ${c.before} to ${c.after}`);
  }
  lines.push('');
  lines.push(s.regressed > 0 ? 'Verdict: regression, exit 1.' : s.scoredFailedAfter < s.scoredFailedBefore ? 'Verdict: strict improvement, no regression, exit 0.' : 'Verdict: no regression, exit 0.');
  return lines.join('\n');
}

export function formatRules(rules: readonly Rule[]): string {
  const lines: string[] = [];
  for (const r of rules) {
    lines.push(`${r.id}  ${r.severity}  [${r.section}]`);
    lines.push(`  ${r.title}`);
    lines.push(`  ${r.description}`);
    lines.push(`  Fix: ${r.remediation}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
