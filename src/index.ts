/**
 * Programmatic API of mcp-migrate-delta. The CLI is a thin layer over these functions.
 */
export * from './report.js';
export { RULES } from './rules/index.js';
export type { PackageManifest, Rule, RuleMatch } from './rules/types.js';
export { createProjectFromDirectory, createProjectFromFiles, type ScanProject } from './scan/project.js';
export { scanExitCode, scanProject } from './scan/scanner.js';
export { applySafeFixes, type AppliedFix, type FixResult, type SkippedFix } from './fix/apply.js';
export { computeDelta, deltaExitCode } from './verify/diff.js';
export { formatDelta, formatRules, formatRun, formatScan } from './format.js';
export { probeUrl, type ProbeResult } from './verify/probe.js';
export {
  CONFORMANCE_PACKAGE,
  availableRevisions,
  conformancePackageVersion,
  loadRequirements,
  parseRequirements,
  type Requirements,
} from './verify/requirements.js';
export { groupRootCauses, normaliseErrorMessage, readRunResults, type RunResults, type RunWithMeta } from './verify/results.js';
export { runConformance, toRunReport, UnreachableServerError, type ConformanceRun, type RunOptions } from './verify/runner.js';
export { TOOL_VERSION } from './version.js';
