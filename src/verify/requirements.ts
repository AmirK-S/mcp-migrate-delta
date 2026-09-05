import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

export const CONFORMANCE_PACKAGE = '@modelcontextprotocol/conformance';

export interface NotScoredScenario {
  id: string;
  reason: string;
}

/** The server leg of a `requirements/<revision>.yaml` file shipped by the conformance suite. */
export interface Requirements {
  revision: string;
  server: {
    scored: string[];
    notScored: NotScoredScenario[];
    /** Scored first, then not scored, in file order. */
    all: string[];
  };
}

const require = createRequire(import.meta.url);

let cachedRoot: string | undefined;

/** Root directory of the installed conformance package. */
export function conformancePackageDir(): string {
  if (cachedRoot) return cachedRoot;
  // The package exposes only a binary, no importable entry, so it cannot be resolved as a
  // module. Probe the node_modules directories Node itself would search from here.
  const candidates = require.resolve.paths(CONFORMANCE_PACKAGE) ?? [];
  for (const base of candidates) {
    const dir = join(base, ...CONFORMANCE_PACKAGE.split('/'));
    if (existsSync(join(dir, 'package.json'))) {
      cachedRoot = dir;
      return dir;
    }
  }
  throw new Error(`Cannot locate ${CONFORMANCE_PACKAGE}: is it installed next to ${TOOL}?`);
}

const TOOL = 'mcp-migrate-delta';

export function conformancePackageVersion(): string {
  const pkg = JSON.parse(readFileSync(join(conformancePackageDir(), 'package.json'), 'utf8')) as { version: string };
  return pkg.version;
}

/** Path of the conformance binary inside the installed package. */
export function conformanceBinPath(): string {
  const pkg = JSON.parse(readFileSync(join(conformancePackageDir(), 'package.json'), 'utf8')) as {
    bin?: string | Record<string, string>;
  };
  const rel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.['conformance'];
  if (!rel) throw new Error(`${CONFORMANCE_PACKAGE} declares no "conformance" binary`);
  return join(conformancePackageDir(), rel);
}

export function availableRevisions(): string[] {
  const dir = join(conformancePackageDir(), 'requirements');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => f.slice(0, -'.yaml'.length))
    .sort();
}

export function requirementsFilePath(revision: string): string {
  const file = join(conformancePackageDir(), 'requirements', `${revision}.yaml`);
  if (!existsSync(file)) {
    const known = availableRevisions();
    throw new Error(
      `${CONFORMANCE_PACKAGE}@${conformancePackageVersion()} ships no requirements for revision ${revision}` +
        (known.length ? ` (known: ${known.join(', ')})` : ''),
    );
  }
  return file;
}

export function loadRequirements(revision: string): Requirements {
  return parseRequirements(revision, readFileSync(requirementsFilePath(revision), 'utf8'));
}

interface RawRequirements {
  server?: unknown;
  client?: unknown;
  not_scored?: unknown;
}

export function parseRequirements(revision: string, text: string): Requirements {
  const raw = parseYaml(text) as RawRequirements | null;
  if (!raw || typeof raw !== 'object') throw new Error(`requirements ${revision}: not a YAML mapping`);
  const scored = asStringList(raw.server, 'server');
  const notScored: NotScoredScenario[] = [];
  if (raw.not_scored !== undefined) {
    if (!Array.isArray(raw.not_scored)) throw new Error(`requirements ${revision}: not_scored is not a list`);
    for (const entry of raw.not_scored) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as { scenario?: unknown; leg?: unknown; reason?: unknown };
      if (e.leg !== 'server' || typeof e.scenario !== 'string') continue;
      notScored.push({ id: e.scenario, reason: typeof e.reason === 'string' ? e.reason : 'unspecified' });
    }
  }
  return {
    revision,
    server: { scored, notScored, all: [...scored, ...notScored.map((s) => s.id)] },
  };
}

function asStringList(value: unknown, key: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    throw new Error(`requirements: "${key}" is not a list of scenario ids`);
  }
  return value as string[];
}
