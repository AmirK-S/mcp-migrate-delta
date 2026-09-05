import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RULES } from '../../src/rules/index.js';
import { createProjectFromDirectory } from '../../src/scan/project.js';
import { scanExitCode, scanProject } from '../../src/scan/scanner.js';

const FIXTURES = join(import.meta.dirname, '..', '..', 'fixtures');

describe('scan of the bundled fixtures', () => {
  it('fires every rule on fixtures/before, the 2025-11-25 server', () => {
    const dir = join(FIXTURES, 'before');
    const report = scanProject(createProjectFromDirectory(dir), dir);
    const fired = new Set(report.findings.map((f) => f.ruleId));
    expect([...fired].sort()).toEqual(RULES.map((r) => r.id).sort());
    expect(report.summary.breaking).toBeGreaterThan(0);
    expect(scanExitCode(report)).toBe(1);
    expect(report.findings.some((f) => f.fix?.confidence === 'safe')).toBe(true);
  });

  it('is silent on fixtures/after, the same server migrated to 2026-07-28', () => {
    const dir = join(FIXTURES, 'after');
    const report = scanProject(createProjectFromDirectory(dir), dir);
    expect(report.findings).toEqual([]);
    expect(scanExitCode(report)).toBe(0);
    expect(report.target.files).toBeGreaterThan(1);
  });
});
