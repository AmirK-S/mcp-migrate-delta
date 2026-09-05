import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPORT_VERSION, TOOL_NAME, type ConformanceRunMeta, type RunReport } from '../report.js';
import { TOOL_VERSION } from '../version.js';
import { probeUrl } from './probe.js';
import { CONFORMANCE_PACKAGE, conformanceBinPath, conformancePackageVersion, loadRequirements } from './requirements.js';
import { readRunResults, type RunResults, type RunWithMeta } from './results.js';

export interface RunOptions {
  url: string;
  /** Specification revision, for example `2026-07-28`. Must be shipped by the pinned suite. */
  requirements: string;
  /** Where the suite writes its `server-<scenario>-<timestamp>/checks.json` directories. Temporary when omitted. */
  outputDir?: string;
  /** Kill the suite after this delay. Default 10 minutes; a real run takes seconds. */
  timeoutMs?: number;
  /** Probe timeout before starting the suite. */
  probeTimeoutMs?: number;
  /** Override the conformance binary (tests). Defaults to the pinned dependency. */
  bin?: string;
  /** Extra environment for the suite process. */
  env?: Record<string, string>;
}

export interface ConformanceRun extends RunWithMeta {
  outputDir: string;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** Exact command line used, for the report and for reproduction by hand. */
  command: string[];
}

export class UnreachableServerError extends Error {
  constructor(
    readonly url: string,
    readonly reason: string,
  ) {
    super(`No HTTP server answers at ${url}: ${reason}. Start the server first; a dead server is not a conformance result.`);
    this.name = 'UnreachableServerError';
  }
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_PROBE_TIMEOUT_MS = 5_000;

/**
 * Runs the pinned conformance suite once against `url` and reads the results back.
 *
 * The suite's own exit code is recorded but never trusted alone: it is 1 for a failing
 * check, for a usage error and for a dead server alike. What is measured comes from the
 * `checks.json` files, lined up against the requirements file so that a scenario the suite
 * crashed on, and wrote nothing for, is still reported.
 */
export async function runConformance(options: RunOptions): Promise<ConformanceRun> {
  const requirements = loadRequirements(options.requirements);
  const version = conformancePackageVersion();

  const probe = await probeUrl(options.url, options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS);
  if (!probe.reachable) throw new UnreachableServerError(options.url, probe.error);

  const bin = options.bin ?? conformanceBinPath();
  if (!existsSync(bin)) throw new Error(`Conformance binary not found at ${bin}`);
  const outputDir = options.outputDir ?? mkdtempSync(join(tmpdir(), 'mcp-migrate-delta-'));
  const args = [bin, 'server', '--url', options.url, '--requirements', options.requirements, '-o', outputDir];
  const startedAt = new Date();
  const started = performance.now();

  const proc = await spawnCaptured(process.execPath, args, {
    env: { ...process.env, ...options.env },
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });

  const results: RunResults = readRunResults(outputDir, requirements);
  const conformance: ConformanceRunMeta = {
    package: CONFORMANCE_PACKAGE,
    version,
    requirements: options.requirements,
    url: options.url,
    startedAt: startedAt.toISOString(),
    durationMs: Math.round(performance.now() - started),
    exitCode: proc.exitCode,
  };
  return {
    ...results,
    conformance,
    outputDir,
    stdout: proc.stdout,
    stderr: proc.stderr,
    timedOut: proc.timedOut,
    command: [process.execPath, ...args],
  };
}

export function toRunReport(run: RunWithMeta): RunReport {
  return {
    reportVersion: REPORT_VERSION,
    kind: 'run',
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    conformance: run.conformance,
    scenarios: run.scenarios,
    summary: run.summary,
    rootCauses: run.rootCauses,
  };
}

interface Captured {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function spawnCaptured(
  command: string,
  args: string[],
  opts: { env: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<Captured> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env: opts.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, opts.timeoutMs);
    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: timedOut ? null : exitCode, stdout, stderr, timedOut });
    };
    child.on('error', (err) => {
      stderr += `${err.message}\n`;
      finish(null);
    });
    child.on('close', (code) => finish(code));
  });
}
