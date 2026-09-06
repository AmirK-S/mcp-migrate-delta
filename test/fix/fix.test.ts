import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applySafeFixes } from '../../src/fix/apply.js';
import { createProjectFromDirectory } from '../../src/scan/project.js';
import { scanProject } from '../../src/scan/scanner.js';

const SOURCE = `import { McpError } from '@modelcontextprotocol/sdk/types.js';
export function notFound(uri: string) {
  throw new McpError(-32002, 'Resource not found: ' + uri);
}
export const ELICIT = -32042;
export const other = { code: -32002, message: 'twice on one line', again: -32002 };
`;

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mmd-fix-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'a.ts'), SOURCE);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { '@modelcontextprotocol/sdk': '1.30.0' } }));
  return dir;
}

describe('applySafeFixes', () => {
  it('rewrites every safe finding in place and leaves review findings untouched', () => {
    const dir = project();
    const report = scanProject(createProjectFromDirectory(dir), dir);
    const result = applySafeFixes(report, dir, { dryRun: false });
    expect(result.applied).toHaveLength(3);
    expect(result.skipped).toEqual([]);
    const after = readFileSync(join(dir, 'src', 'a.ts'), 'utf8');
    expect(after).not.toContain('-32002');
    expect(after).toContain('new McpError(-32602,');
    expect(after).toContain("{ code: -32602, message: 'twice on one line', again: -32602 }");
    expect(after).toContain('-32042');
    expect(result.remaining.filter((f) => f.ruleId === 'error-codes')).toHaveLength(1);
    expect(result.remaining.some((f) => f.ruleId === 'sdk-v1-package')).toBe(true);
  });

  it('changes nothing in dry run but reports what it would do', () => {
    const dir = project();
    const report = scanProject(createProjectFromDirectory(dir), dir);
    const result = applySafeFixes(report, dir, { dryRun: true });
    expect(result.applied).toHaveLength(3);
    expect(readFileSync(join(dir, 'src', 'a.ts'), 'utf8')).toBe(SOURCE);
  });

  it('is idempotent: a second pass finds nothing safe to do', () => {
    const dir = project();
    applySafeFixes(scanProject(createProjectFromDirectory(dir), dir), dir, { dryRun: false });
    const second = applySafeFixes(scanProject(createProjectFromDirectory(dir), dir), dir, { dryRun: false });
    expect(second.applied).toEqual([]);
  });

  it('handles a file that starts with a UTF-8 BOM, whose first line carries a finding', () => {
    const dir = project();
    writeFileSync(join(dir, 'src', 'b.ts'), '\uFEFFconst code = -32002;\nconst two = -32002;\n');
    const result = applySafeFixes(scanProject(createProjectFromDirectory(dir), dir), dir, { dryRun: false });
    expect(result.skipped).toEqual([]);
    const after = readFileSync(join(dir, 'src', 'b.ts'), 'utf8');
    expect(after.startsWith('\uFEFF')).toBe(true);
    expect(after).not.toContain('-32002');
  });

  it('never writes outside the scanned root, whatever a report says', () => {
    const dir = project();
    const report = scanProject(createProjectFromDirectory(dir), dir);
    const outside = mkdtempSync(join(tmpdir(), 'mmd-outside-'));
    writeFileSync(join(outside, 'victim.ts'), 'const code = -32002;\n');
    const forged = { ...report, findings: report.findings.map((f) => ({ ...f, file: join('..', '..', outside.split('/').slice(-2).join('/'), 'victim.ts') })) };
    const result = applySafeFixes(forged, dir, { dryRun: false });
    expect(result.applied).toEqual([]);
    expect(result.skipped.every((s) => /outside/.test(s.reason))).toBe(true);
    expect(readFileSync(join(outside, 'victim.ts'), 'utf8')).toContain('-32002');
  });

  it('refuses a finding whose text no longer matches the file, instead of corrupting it', () => {
    const dir = project();
    const report = scanProject(createProjectFromDirectory(dir), dir);
    // An extra space shifts every column of that line, so the recorded positions no longer match.
    writeFileSync(join(dir, 'src', 'a.ts'), SOURCE.replace('throw new McpError(-32002', 'throw  new McpError(-32002'));
    const result = applySafeFixes(report, dir, { dryRun: false });
    expect(result.skipped.length).toBeGreaterThan(0);
    expect(result.skipped[0]?.reason).toMatch(/does not match/);
    expect(readFileSync(join(dir, 'src', 'a.ts'), 'utf8')).toContain('throw  new McpError(-32002');
  });
});
