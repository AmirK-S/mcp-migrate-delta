import type { PackageManifest, Rule, RuleMatch } from './types.js';

const PACKAGE = '@modelcontextprotocol/sdk';
const SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

/**
 * A server that depends on `@modelcontextprotocol/sdk` 1.x cannot serve 2026-07-28 at all:
 * the 1.x line has no `server/discover`, rejects the 2026-07-28 protocol version and answers
 * every stateless request with `-32000 Server not initialized`. Migrating means changing
 * package, which is why every other rule presupposes this one.
 */
export const sdkV1Package: Rule = {
  id: 'sdk-v1-package',
  severity: 'breaking',
  section: 'Major 2, Major 3',
  title: 'Server built on @modelcontextprotocol/sdk 1.x',
  description:
    'The 1.x line of the TypeScript SDK serves 2025-11-25 at most. Revision 2026-07-28 (stateless, server/discover, per-request _meta) is only served by @modelcontextprotocol/server 2.x.',
  remediation:
    'Replace @modelcontextprotocol/sdk with @modelcontextprotocol/server 2.x (plus @modelcontextprotocol/node for Node transports), then run the official codemod for the SDK surface: npx @modelcontextprotocol/codemod@latest v1-to-v2 . The protocol adoption itself is architectural; see docs/migration/support-2026-07-28.md in the SDK repository.',
  checkManifest(manifest: PackageManifest): RuleMatch[] {
    if (!manifest.json) return [];
    const matches: RuleMatch[] = [];
    for (const section of SECTIONS) {
      const deps = manifest.json[section];
      if (!deps || typeof deps !== 'object') continue;
      const range = (deps as Record<string, unknown>)[PACKAGE];
      if (typeof range !== 'string') continue;
      const major = majorOf(range);
      if (major === null || major >= 2) continue;
      const { line, column, snippet } = locate(manifest.text, PACKAGE, section);
      matches.push({
        line,
        column,
        snippet,
        message: `${section} pins ${PACKAGE} at "${range}", a 1.x line that cannot serve revision 2026-07-28.`,
        fix: null,
      });
    }
    return matches;
  },
};

/**
 * Lowest major a range can resolve to, or null when the range is not a plain semver range
 * (workspace:, file:, git URLs, aliases), in which case the rule stays silent.
 */
export function majorOf(range: string): number | null {
  const trimmed = range.trim();
  // An unbounded range resolves to the 1.x line today: the 2.x SDK ships under another package
  // name (@modelcontextprotocol/server) and the latest tag of this one stays 1.x. A 2.x release
  // under this name would make this branch a false positive; revisit if that happens.
  if (trimmed === '' || trimmed === '*' || trimmed === 'latest' || trimmed === 'x') return 1;
  if (/^(workspace:|file:|link:|npm:|github:|git\+|git:|https?:|ssh:)/.test(trimmed)) return null;
  const m = /^[\^~>=<\s]*v?(\d+)/.exec(trimmed);
  if (!m) return null;
  return Number(m[1]);
}

function locate(text: string, key: string, section: string): { line: number; column: number; snippet: string } {
  const lines = text.split(/\r?\n/);
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.includes(`"${section}"`)) inSection = true;
    const col = line.indexOf(`"${key}"`);
    if (inSection && col !== -1) return { line: i + 1, column: col + 1, snippet: line.trim() };
  }
  const fallback = lines.findIndex((l) => l.includes(`"${key}"`));
  return fallback === -1
    ? { line: 1, column: 1, snippet: lines[0]?.trim() ?? '' }
    : { line: fallback + 1, column: lines[fallback]!.indexOf(`"${key}"`) + 1, snippet: lines[fallback]!.trim() };
}
