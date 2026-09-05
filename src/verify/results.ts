import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHECK_STATUSES,
  emptyCheckCounts,
  emptyOutcomeCounts,
  type CheckStatus,
  type CheckSummary,
  type ConformanceRunMeta,
  type RawConformanceCheck,
  type RootCause,
  type RunSummary,
  type ScenarioOutcome,
  type ScenarioResult,
} from '../report.js';
import type { Requirements } from './requirements.js';

/** What can be read back from an output directory, before run metadata is attached. */
export interface RunResults {
  scenarios: ScenarioResult[];
  summary: RunSummary;
  rootCauses: RootCause[];
}

export type RunWithMeta = RunResults & { conformance: ConformanceRunMeta };

export const NOT_IN_REQUIREMENTS = 'not-in-requirements';

const DIR_NAME = /^(server|client)-(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)$/;

export function parseResultDirName(name: string): { leg: string; scenario: string; timestamp: string } | null {
  const m = DIR_NAME.exec(name);
  if (!m) return null;
  return { leg: m[1]!, scenario: m[2]!, timestamp: m[3]! };
}

/**
 * Reads every `server-<scenario>-<timestamp>/checks.json` under `outputDir` and lines the
 * scenarios up against the requirements file. A scenario the requirements expect but the
 * suite wrote nothing for is reported as `crashed`, never dropped.
 */
export function readRunResults(outputDir: string, requirements: Requirements): RunResults {
  const found = new Map<string, { dir: string; timestamp: string; checks: CheckSummary[] }>();
  if (existsSync(outputDir)) {
    for (const entry of readdirSync(outputDir)) {
      const parsed = parseResultDirName(entry);
      if (!parsed || parsed.leg !== 'server') continue;
      const dir = join(outputDir, entry);
      if (!statSync(dir).isDirectory()) continue;
      const file = join(dir, 'checks.json');
      if (!existsSync(file)) continue;
      const checks = readChecksFile(file);
      const previous = found.get(parsed.scenario);
      if (!previous || previous.timestamp < parsed.timestamp) {
        found.set(parsed.scenario, { dir: entry, timestamp: parsed.timestamp, checks });
      }
    }
  }

  const notScoredReason = new Map(requirements.server.notScored.map((s) => [s.id, s.reason]));
  const scenarios: ScenarioResult[] = [];

  for (const id of requirements.server.all) {
    const reason = notScoredReason.get(id);
    const hit = found.get(id);
    found.delete(id);
    scenarios.push(buildScenario(id, reason, hit));
  }
  for (const id of [...found.keys()].sort()) {
    scenarios.push(buildScenario(id, NOT_IN_REQUIREMENTS, found.get(id)));
  }

  return { scenarios, summary: summarise(scenarios), rootCauses: groupRootCauses(scenarios) };
}

function buildScenario(
  id: string,
  notScoredReason: string | undefined,
  hit: { dir: string; checks: CheckSummary[] } | undefined,
): ScenarioResult {
  const scenario: ScenarioResult = {
    id,
    scored: notScoredReason === undefined,
    outcome: hit ? outcomeOf(hit.checks) : 'crashed',
    checks: hit?.checks ?? [],
  };
  if (notScoredReason !== undefined) scenario.notScoredReason = notScoredReason;
  if (hit) scenario.resultDir = hit.dir;
  return scenario;
}

export function outcomeOf(checks: CheckSummary[]): ScenarioOutcome {
  if (checks.some((c) => c.status === 'FAILURE')) return 'fail';
  if (checks.some((c) => c.status === 'SUCCESS')) return 'pass';
  return 'empty';
}

function readChecksFile(file: string): CheckSummary[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${file}: invalid checks.json (${(err as Error).message})`);
  }
  if (!Array.isArray(parsed)) throw new Error(`${file}: checks.json is not an array`);
  return parsed.map((raw, i) => {
    const c = raw as Partial<RawConformanceCheck>;
    if (!c || typeof c.id !== 'string' || !CHECK_STATUSES.includes(c.status as CheckStatus)) {
      throw new Error(`${file}: entry ${i} of checks.json is not a conformance check`);
    }
    const summary: CheckSummary = { id: c.id, status: c.status as CheckStatus };
    if (typeof c.errorMessage === 'string') summary.errorMessage = c.errorMessage;
    return summary;
  });
}

function summarise(scenarios: ScenarioResult[]): RunSummary {
  const summary: RunSummary = { scored: emptyOutcomeCounts(), notScored: emptyOutcomeCounts(), checks: emptyCheckCounts() };
  for (const s of scenarios) {
    const bucket = s.scored ? summary.scored : summary.notScored;
    bucket.total += 1;
    if (s.outcome === 'pass') bucket.passed += 1;
    else if (s.outcome === 'fail') bucket.failed += 1;
    else if (s.outcome === 'crashed') bucket.crashed += 1;
    else bucket.empty += 1;
    for (const c of s.checks) summary.checks[c.status] += 1;
  }
  return summary;
}

const HARNESS_PREFIXES = [/^Failed:\s+/, /^JSON-RPC error:\s+/];

/**
 * Reduces an `errorMessage` to the part that identifies a cause: the raw JSON-RPC message
 * the wire validator appends is dropped, and harness prefixes are stripped so the same
 * cause reported by two scenarios groups together.
 */
export function normaliseErrorMessage(message: string | undefined): string {
  if (!message) return '(no error message)';
  let text = message;
  // The wire validator appends the raw message after an em dash (U+2014) separator.
  const sep = text.indexOf(' \u2014 message:');
  if (sep !== -1) text = text.slice(0, sep);
  for (const prefix of HARNESS_PREFIXES) text = text.replace(prefix, '');
  return text.trim() || '(no error message)';
}

export function groupRootCauses(scenarios: Pick<ScenarioResult, 'id' | 'checks'>[]): RootCause[] {
  const groups = new Map<string, { checks: number; scenarios: Set<string> }>();
  for (const s of scenarios) {
    for (const c of s.checks) {
      if (c.status !== 'FAILURE') continue;
      const cause = normaliseErrorMessage(c.errorMessage);
      const g = groups.get(cause) ?? { checks: 0, scenarios: new Set<string>() };
      g.checks += 1;
      g.scenarios.add(s.id);
      groups.set(cause, g);
    }
  }
  return [...groups.entries()]
    .map(([cause, g]) => ({ cause, checks: g.checks, scenarios: [...g.scenarios] }))
    .sort((a, b) => b.checks - a.checks || a.cause.localeCompare(b.cause));
}
