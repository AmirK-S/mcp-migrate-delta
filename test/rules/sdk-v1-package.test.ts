import { describe, expect, it } from 'vitest';
import { findingsOf, V1_PACKAGE, V2_PACKAGE } from './helpers.js';

const RULE = 'sdk-v1-package';

describe(RULE, () => {
  it('flags a manifest that depends on @modelcontextprotocol/sdk 1.x', () => {
    const findings = findingsOf(RULE, { 'package.json': V1_PACKAGE });
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.severity).toBe('breaking');
    expect(f.section).toBe('Major 2');
    expect(f.file).toBe('package.json');
    expect(f.line).toBeGreaterThan(1);
    expect(f.snippet).toContain('@modelcontextprotocol/sdk');
    expect(f.message).toMatch(/1\.x/);
    expect(f.remediation).toMatch(/@modelcontextprotocol\/server/);
    expect(f.fix).toBeNull();
  });

  it('flags the dependency whatever the range syntax used for 1.x', () => {
    for (const range of ['1.30.0', '~1.29.0', '>=1.0.0 <2', '1.x', '*', 'latest']) {
      const pkg = JSON.stringify({ dependencies: { '@modelcontextprotocol/sdk': range } });
      expect(findingsOf(RULE, { 'package.json': pkg }), range).toHaveLength(1);
    }
  });

  it('looks in devDependencies and peerDependencies too', () => {
    const pkg = JSON.stringify({ peerDependencies: { '@modelcontextprotocol/sdk': '^1.0.0' } });
    expect(findingsOf(RULE, { 'package.json': pkg })).toHaveLength(1);
  });

  it('stays silent on a migrated manifest', () => {
    expect(findingsOf(RULE, { 'package.json': V2_PACKAGE })).toEqual([]);
  });

  it('stays silent on a 2.x range of the old package name', () => {
    const pkg = JSON.stringify({ dependencies: { '@modelcontextprotocol/sdk': '^2.0.0' } });
    expect(findingsOf(RULE, { 'package.json': pkg })).toEqual([]);
  });

  it('stays silent on ranges it cannot read, rather than guessing', () => {
    for (const range of ['workspace:*', 'file:../sdk', 'github:org/repo', 'npm:@scope/other@1.0.0']) {
      const pkg = JSON.stringify({ dependencies: { '@modelcontextprotocol/sdk': range } });
      expect(findingsOf(RULE, { 'package.json': pkg }), range).toEqual([]);
    }
  });

  it('scans every manifest of a monorepo but never node_modules', () => {
    const findings = findingsOf(RULE, {
      'package.json': V2_PACKAGE,
      'packages/a/package.json': V1_PACKAGE,
      'packages/b/package.json': V1_PACKAGE,
      'node_modules/dep/package.json': V1_PACKAGE,
    });
    expect(findings.map((f) => f.file).sort()).toEqual(['packages/a/package.json', 'packages/b/package.json']);
  });

  it('ignores a manifest that is not valid JSON', () => {
    expect(findingsOf(RULE, { 'package.json': '{ not json' })).toEqual([]);
  });
});
