/**
 * Versioned JSON contracts emitted by `mcp-migrate-delta`.
 *
 * Every report carries `reportVersion`. A consumer that sees a higher version
 * than it knows must refuse to parse rather than guess.
 */

export const REPORT_VERSION = 1 as const;

export const TOOL_NAME = 'mcp-migrate-delta';

/** Check statuses exactly as written by `@modelcontextprotocol/conformance` in `checks.json`. */
export type CheckStatus = 'SUCCESS' | 'FAILURE' | 'WARNING' | 'SKIPPED' | 'INFO';

export const CHECK_STATUSES: readonly CheckStatus[] = ['SUCCESS', 'FAILURE', 'WARNING', 'SKIPPED', 'INFO'];

/** One entry of a `checks.json` file, as the conformance suite writes it. */
export interface RawConformanceCheck {
  id: string;
  name?: string;
  description?: string;
  status: CheckStatus;
  timestamp?: string;
  errorMessage?: string;
  specReferences?: { id: string; url: string }[];
  details?: Record<string, unknown>;
}

/** A check reduced to what the delta needs. */
export interface CheckSummary {
  id: string;
  status: CheckStatus;
  errorMessage?: string;
}

/**
 * Outcome of one scenario.
 * - `pass`: no check has status FAILURE.
 * - `fail`: at least one check has status FAILURE.
 * - `crashed`: the scenario was expected but the suite wrote no `checks.json` for it. It creates
 *   the result directory before running the scenario and writes the file after, so an exception
 *   leaves an empty directory while the terminal summary counts the scenario as failed.
 * - `empty`: the scenario produced no SUCCESS and no FAILURE check at all, so it is
 *   reported green by the suite with a zero denominator.
 */
export type ScenarioOutcome = 'pass' | 'fail' | 'crashed' | 'empty';

export interface ScenarioResult {
  id: string;
  scored: boolean;
  /** Reason given by the requirements file when the scenario is not scored. */
  notScoredReason?: string;
  outcome: ScenarioOutcome;
  checks: CheckSummary[];
  /** Directory the suite wrote, relative to the output directory. Absent when crashed. */
  resultDir?: string;
}

export interface OutcomeCounts {
  total: number;
  passed: number;
  failed: number;
  crashed: number;
  empty: number;
}

export interface RunSummary {
  scored: OutcomeCounts;
  notScored: OutcomeCounts;
  checks: Record<CheckStatus, number>;
}

/** Failures grouped by normalised error message. */
export interface RootCause {
  cause: string;
  checks: number;
  scenarios: string[];
}

export interface ConformanceRunMeta {
  package: string;
  version: string;
  requirements: string;
  url: string;
  startedAt: string;
  durationMs: number;
  /** Exit code of the suite process, or null when it could not be started. */
  exitCode: number | null;
}

export interface RunReport {
  reportVersion: typeof REPORT_VERSION;
  kind: 'run';
  tool: { name: string; version: string };
  conformance: ConformanceRunMeta;
  scenarios: ScenarioResult[];
  summary: RunSummary;
  rootCauses: RootCause[];
}

export type CheckChangeKind = 'fixed' | 'regressed' | 'added' | 'removed' | 'changed';

export interface CheckChange {
  scenario: string;
  check: string;
  before: CheckStatus | 'absent';
  after: CheckStatus | 'absent';
  kind: CheckChangeKind;
}

export interface ScenarioChange {
  scenario: string;
  scored: boolean;
  before: ScenarioOutcome | 'absent';
  after: ScenarioOutcome | 'absent';
}

export interface DeltaSummary {
  scoredFailedBefore: number;
  scoredFailedAfter: number;
  /** Checks that went from FAILURE to SUCCESS. */
  fixed: number;
  /** Checks that went from SUCCESS to FAILURE. */
  regressed: number;
  /** Checks that are FAILURE on both sides. */
  stillFailing: number;
  added: number;
  removed: number;
}

export interface DeltaReport {
  reportVersion: typeof REPORT_VERSION;
  kind: 'delta';
  tool: { name: string; version: string };
  baseline: ConformanceRunMeta;
  current: ConformanceRunMeta;
  summary: DeltaSummary;
  scenarios: ScenarioChange[];
  changes: CheckChange[];
}

export type Severity = 'breaking' | 'advisory';

export type FixConfidence = 'safe' | 'review';

export interface Finding {
  ruleId: string;
  severity: Severity;
  /** Section of the 2026-07-28 changelog, for example "Major 2". */
  section: string;
  file: string;
  line: number;
  column: number;
  snippet: string;
  message: string;
  remediation: string;
  fix: { confidence: FixConfidence; replacement: string } | null;
}

export interface ScanReport {
  reportVersion: typeof REPORT_VERSION;
  kind: 'scan';
  tool: { name: string; version: string };
  target: { path: string; files: number };
  revision: { from: '2025-11-25'; to: '2026-07-28' };
  summary: { breaking: number; advisory: number; rules: string[] };
  findings: Finding[];
}

export function emptyCheckCounts(): Record<CheckStatus, number> {
  return { SUCCESS: 0, FAILURE: 0, WARNING: 0, SKIPPED: 0, INFO: 0 };
}

export function emptyOutcomeCounts(): OutcomeCounts {
  return { total: 0, passed: 0, failed: 0, crashed: 0, empty: 0 };
}
