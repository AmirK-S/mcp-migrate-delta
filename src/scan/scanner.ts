import { relative, sep } from 'node:path';
import { REPORT_VERSION, TOOL_NAME, type Finding, type ScanReport } from '../report.js';
import { RULES } from '../rules/index.js';
import type { Rule, RuleMatch } from '../rules/types.js';
import { TOOL_VERSION } from '../version.js';
import type { ScanProject } from './project.js';

/** Runs every rule over the sources and manifests of a scan target. */
export function scanProject(target: ScanProject, root: string, rules: readonly Rule[] = RULES): ScanReport {
  const findings: Finding[] = [];

  for (const file of target.project.getSourceFiles()) {
    const rel = relativePath(target.root, file.getFilePath());
    for (const rule of rules) {
      if (!rule.checkSource) continue;
      for (const match of rule.checkSource(file)) findings.push(toFinding(rule, rel, match));
    }
  }

  for (const manifest of target.manifests) {
    for (const rule of rules) {
      if (!rule.checkManifest) continue;
      for (const match of rule.checkManifest(manifest)) findings.push(toFinding(rule, manifest.relativePath, match));
    }
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.ruleId.localeCompare(b.ruleId));

  return {
    reportVersion: REPORT_VERSION,
    kind: 'scan',
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    target: { path: root, files: target.project.getSourceFiles().length + target.manifests.length },
    revision: { from: '2025-11-25', to: '2026-07-28' },
    summary: {
      breaking: findings.filter((f) => f.severity === 'breaking').length,
      advisory: findings.filter((f) => f.severity === 'advisory').length,
      rules: rules.map((r) => r.id),
    },
    findings,
  };
}

/** 1 when at least one breaking finding exists, 0 otherwise. Advisory findings never fail a build. */
export function scanExitCode(report: ScanReport): 0 | 1 {
  return report.summary.breaking > 0 ? 1 : 0;
}

function toFinding(rule: Rule, file: string, match: RuleMatch): Finding {
  return {
    ruleId: rule.id,
    severity: match.severity ?? rule.severity,
    section: rule.section,
    file,
    line: match.line,
    column: match.column,
    snippet: match.snippet,
    message: match.message,
    remediation: match.remediation ?? rule.remediation,
    fix: match.fix ?? null,
  };
}

function relativePath(root: string, absolute: string): string {
  const rel = root === '/' ? absolute.replace(/^\/+/, '') : relative(root, absolute);
  return rel.split(sep).join('/');
}
