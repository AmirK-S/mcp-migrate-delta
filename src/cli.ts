#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { Command, InvalidArgumentError } from 'commander';
import { applySafeFixes } from './fix/apply.js';
import { formatDelta, formatFix, formatRules, formatRun, formatScan } from './format.js';
import { REPORT_VERSION, type RunReport } from './report.js';
import { RULES } from './rules/index.js';
import { createProjectFromDirectory } from './scan/project.js';
import { scanExitCode, scanProject } from './scan/scanner.js';
import { computeDelta, deltaExitCode } from './verify/diff.js';
import { runConformance, toRunReport, UnreachableServerError } from './verify/runner.js';
import { TOOL_VERSION } from './version.js';

const DEFAULT_REVISION = '2026-07-28';

const program = new Command();
// Usage errors exit 2, never 1: exit 1 is reserved for findings and regressions so that a
// typo in a flag can never read as a conformance failure in CI.
program.exitOverride((err) => {
  if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version' || err.code === 'commander.help') process.exit(0);
  process.exit(2);
});
program
  .name('mcp-migrate-delta')
  .description('Measure what MCP revision 2026-07-28 breaks in a 2025-11-25 TypeScript server, and prove the migration with the official conformance suite before and after.')
  .version(TOOL_VERSION);

program
  .command('scan')
  .description('Static scan of a TypeScript or JavaScript MCP server for constructs that revision 2026-07-28 removes')
  .argument('<path>', 'directory or file to scan')
  .option('--json', 'print the JSON report instead of text')
  .option('--report <file>', 'also write the JSON report to this file')
  .action((path: string, opts: { json?: boolean; report?: string }) => {
    let target;
    try {
      target = createProjectFromDirectory(path);
    } catch {
      throw new Error(`Cannot read ${path}: pass a directory or a single TypeScript, JavaScript or package.json file.`);
    }
    const report = scanProject(target, target.root);
    if (opts.report) writeFileSync(opts.report, JSON.stringify(report, null, 2) + '\n');
    process.stdout.write((opts.json ? JSON.stringify(report, null, 2) : formatScan(report)) + '\n');
    process.exitCode = scanExitCode(report);
  });

program
  .command('fix')
  .description('Apply the safe mechanical replacements found by scan (today: -32002 to -32602); everything else is listed for a human')
  .argument('<path>', 'directory or file to fix')
  .option('--dry-run', 'show what would change without writing')
  .option('--json', 'print the JSON result instead of text')
  .action((path: string, opts: { dryRun?: boolean; json?: boolean }) => {
    let target;
    try {
      target = createProjectFromDirectory(path);
    } catch {
      throw new Error(`Cannot read ${path}: pass a directory or a single TypeScript, JavaScript or package.json file.`);
    }
    const report = scanProject(target, target.root);
    const result = applySafeFixes(report, target.root, { dryRun: opts.dryRun ?? false });
    process.stdout.write((opts.json ? JSON.stringify(result, null, 2) : formatFix(result, opts.dryRun ?? false)) + '\n');
    process.exitCode = result.skipped.length > 0 ? 1 : 0;
  });

program
  .command('verify')
  .description('Run the pinned official conformance suite against a live server and, with --baseline, print the delta')
  .requiredOption('--url <url>', 'Streamable HTTP endpoint of the server under test, for example http://localhost:3000/mcp')
  .option('--requirements <revision>', 'specification revision to require', DEFAULT_REVISION)
  .option('--baseline <file>', 'JSON run report of an earlier verify to compare against')
  .option('--report <file>', 'write the JSON run report (or delta report with --baseline) to this file')
  .option('--output-dir <dir>', 'keep the raw checks.json directories of the suite here')
  .option('--timeout <ms>', 'kill the suite after this many milliseconds', parsePositiveInt, 10 * 60 * 1000)
  .option('--json', 'print the JSON report instead of text')
  .action(async (opts: { url: string; requirements: string; baseline?: string; report?: string; outputDir?: string; timeout: number; json?: boolean }) => {
    const bin = process.env['MCP_MIGRATE_DELTA_CONFORMANCE_BIN'];
    // Read the baseline before the campaign so a wrong path costs nothing.
    const baseline = opts.baseline ? readRunReport(opts.baseline) : null;
    let run;
    try {
      run = await runConformance({
        url: opts.url,
        requirements: opts.requirements,
        timeoutMs: opts.timeout,
        ...(opts.outputDir ? { outputDir: opts.outputDir } : {}),
        ...(bin ? { bin } : {}),
      });
    } catch (err) {
      if (err instanceof UnreachableServerError) {
        process.stderr.write(err.message + '\n');
        process.exitCode = 2;
        return;
      }
      throw err;
    }
    const report = toRunReport(run);
    if (run.timedOut) process.stderr.write(`The suite was killed after ${opts.timeout} ms; results below are partial.\n`);

    if (!baseline) {
      if (opts.report) writeFileSync(opts.report, JSON.stringify(report, null, 2) + '\n');
      process.stdout.write((opts.json ? JSON.stringify(report, null, 2) : formatRun(report)) + '\n');
      process.exitCode = report.summary.scored.failed + report.summary.scored.crashed > 0 ? 1 : 0;
      return;
    }

    const delta = computeDelta(baseline, run);
    if (opts.report) writeFileSync(opts.report, JSON.stringify(delta, null, 2) + '\n');
    process.stdout.write((opts.json ? JSON.stringify(delta, null, 2) : formatRun(report) + '\n\n' + formatDelta(delta)) + '\n');
    process.exitCode = deltaExitCode(delta);
  });

program
  .command('rules')
  .description('List the rules the scanner applies')
  .option('--json', 'print as JSON')
  .action((opts: { json?: boolean }) => {
    const rows = RULES.map(({ id, severity, section, title, description, remediation }) => ({ id, severity, section, title, description, remediation }));
    process.stdout.write((opts.json ? JSON.stringify(rows, null, 2) : formatRules(RULES)) + '\n');
  });

function parsePositiveInt(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new InvalidArgumentError('expected a positive integer');
  return n;
}

function readRunReport(file: string): RunReport {
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<RunReport>;
  if (parsed.kind !== 'run') throw new Error(`${file}: not a run report (kind "${String(parsed.kind)}"); pass the JSON written by verify --report`);
  if (parsed.reportVersion !== REPORT_VERSION) {
    throw new Error(`${file}: report version ${String(parsed.reportVersion)} is not the ${REPORT_VERSION} this tool understands`);
  }
  return parsed as RunReport;
}

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 2;
});
