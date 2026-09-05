import type { Finding, ScanReport } from '../../src/report.js';
import { createProjectFromFiles } from '../../src/scan/project.js';
import { scanProject } from '../../src/scan/scanner.js';

/** Scans an in-memory tree and returns the findings of one rule. */
export function findingsOf(ruleId: string, files: Record<string, string>): Finding[] {
  return scanFiles(files).findings.filter((f) => f.ruleId === ruleId);
}

export function scanFiles(files: Record<string, string>): ScanReport {
  const project = createProjectFromFiles(files);
  return scanProject(project, '/');
}

/** A 2025-11-25 package manifest, the common case. */
export const V1_PACKAGE = JSON.stringify(
  { name: 'demo', version: '1.0.0', dependencies: { '@modelcontextprotocol/sdk': '^1.30.0', express: '^5.0.0' } },
  null,
  2,
);

/** A migrated package manifest. */
export const V2_PACKAGE = JSON.stringify(
  { name: 'demo', version: '1.0.0', dependencies: { '@modelcontextprotocol/server': '2.0.0', '@modelcontextprotocol/node': '2.0.0' } },
  null,
  2,
);
