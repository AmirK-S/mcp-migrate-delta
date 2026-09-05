import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPORT_VERSION } from '../../src/report.js';
import { RULES } from '../../src/rules/index.js';
import { createProjectFromDirectory } from '../../src/scan/project.js';
import { scanExitCode, scanProject } from '../../src/scan/scanner.js';
import { scanFiles, V1_PACKAGE, V2_PACKAGE } from '../rules/helpers.js';

const V1_SERVER = `
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SetLevelRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => 'id' });
server.setRequestHandler(SetLevelRequestSchema, async () => ({}));
throw new McpError(-32002, 'nope');
`;

describe('scanProject report', () => {
  const report = scanFiles({ 'package.json': V1_PACKAGE, 'src/server.ts': V1_SERVER });

  it('carries the versioned contract and the revision pair', () => {
    expect(report.reportVersion).toBe(REPORT_VERSION);
    expect(report.kind).toBe('scan');
    expect(report.tool.name).toBe('mcp-migrate-delta');
    expect(report.tool.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(report.revision).toEqual({ from: '2025-11-25', to: '2026-07-28' });
  });

  it('counts findings by severity and lists the rules that ran', () => {
    expect(report.summary.breaking).toBe(4);
    expect(report.summary.advisory).toBe(0);
    expect(report.summary.rules).toEqual(RULES.map((r) => r.id));
    expect(report.target.files).toBe(2);
  });

  it('orders findings by file, then line, then rule', () => {
    const keys = report.findings.map((f) => `${f.file}:${f.line}:${f.ruleId}`);
    expect(keys).toEqual([...keys].sort());
  });

  it('gives every finding a relative path, a snippet and a remediation', () => {
    for (const f of report.findings) {
      expect(f.file.startsWith('/')).toBe(false);
      expect(f.snippet.length).toBeGreaterThan(0);
      expect(f.remediation.length).toBeGreaterThan(0);
      expect(f.line).toBeGreaterThan(0);
      expect(f.column).toBeGreaterThan(0);
    }
  });
});

describe('scanExitCode', () => {
  it('is 1 only when a breaking finding exists', () => {
    expect(scanExitCode(scanFiles({ 'package.json': V1_PACKAGE }))).toBe(1);
    expect(scanExitCode(scanFiles({ 'package.json': V2_PACKAGE }))).toBe(0);
    expect(scanExitCode(scanFiles({ 'src/a.ts': 'const c = -32042;\n' }))).toBe(0);
  });
});

describe('createProjectFromDirectory', () => {
  it('reads sources and manifests from disk, skipping node_modules, dist and .git', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mmd-scan-'));
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'node_modules', 'x'), { recursive: true });
    mkdirSync(join(dir, 'dist'));
    mkdirSync(join(dir, '.git'));
    writeFileSync(join(dir, 'package.json'), V1_PACKAGE);
    writeFileSync(join(dir, 'src', 'server.ts'), V1_SERVER);
    writeFileSync(join(dir, 'src', 'util.js'), 'export const x = -32002;\n');
    writeFileSync(join(dir, 'node_modules', 'x', 'index.js'), 'export const x = -32002;\n');
    writeFileSync(join(dir, 'dist', 'server.js'), V1_SERVER);
    writeFileSync(join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    const report = scanProject(createProjectFromDirectory(dir), dir);
    expect(report.target.path).toBe(dir);
    expect(report.target.files).toBe(3);
    expect(new Set(report.findings.map((f) => f.file))).toEqual(new Set(['package.json', 'src/server.ts', 'src/util.js']));
  });

  it('accepts a single file path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mmd-scan-'));
    writeFileSync(join(dir, 'server.ts'), V1_SERVER);
    const report = scanProject(createProjectFromDirectory(join(dir, 'server.ts')), dir);
    expect(report.target.files).toBe(1);
    expect(report.findings.map((f) => f.file)).toEqual(['server.ts', 'server.ts', 'server.ts']);
  });
});
