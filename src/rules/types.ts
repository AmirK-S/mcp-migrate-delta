import type { Node, SourceFile } from 'ts-morph';
import type { FixConfidence, Severity } from '../report.js';

/** What a rule reports for one location; the scanner adds rule metadata and the file path. */
export interface RuleMatch {
  line: number;
  column: number;
  snippet: string;
  message: string;
  /** Override the rule's severity for this match. */
  severity?: Severity;
  /** Override the rule's remediation for this match. */
  remediation?: string;
  fix?: { confidence: FixConfidence; replacement: string; original?: string } | null;
}

export interface PackageManifest {
  /** Path relative to the scan root, for example `packages/a/package.json`. */
  relativePath: string;
  /** Raw text, for line numbers. */
  text: string;
  /** Parsed JSON, or null when the file is not valid JSON. */
  json: Record<string, unknown> | null;
}

export interface Rule {
  id: string;
  severity: Severity;
  /** Section of the 2026-07-28 changelog. */
  section: string;
  title: string;
  description: string;
  remediation: string;
  /** Inspects one TypeScript or JavaScript source file. */
  checkSource?(file: SourceFile): RuleMatch[];
  /** Inspects one package.json. */
  checkManifest?(manifest: PackageManifest): RuleMatch[];
}

/** Builds a match anchored on a syntax node. */
export function matchAt(node: Node, message: string, extra: Partial<RuleMatch> = {}): RuleMatch {
  const file = node.getSourceFile();
  const { line, column } = file.getLineAndColumnAtPos(node.getStart());
  const lineText = file.getFullText().split(/\r?\n/)[line - 1] ?? '';
  return { line, column, snippet: lineText.trim(), message, fix: null, ...extra };
}
