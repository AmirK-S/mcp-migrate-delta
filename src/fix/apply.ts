import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Finding, ScanReport } from '../report.js';

export interface AppliedFix {
  file: string;
  line: number;
  column: number;
  from: string;
  to: string;
  ruleId: string;
}

export interface SkippedFix extends AppliedFix {
  reason: string;
}

export interface FixResult {
  applied: AppliedFix[];
  skipped: SkippedFix[];
  /** Findings that carry no safe fix and remain for a human. */
  remaining: Finding[];
}

/**
 * Applies the findings whose fix is marked `safe`, in place, file by file. Every replacement is
 * checked against the text actually present at the reported position; a mismatch skips that
 * finding rather than editing blindly. Findings with no safe fix are returned untouched.
 */
export function applySafeFixes(report: ScanReport, root: string, options: { dryRun: boolean }): FixResult {
  const result: FixResult = { applied: [], skipped: [], remaining: [] };
  const byFile = new Map<string, Finding[]>();
  for (const finding of report.findings) {
    if (finding.fix?.confidence !== 'safe' || !finding.fix.original) {
      result.remaining.push(finding);
      continue;
    }
    const list = byFile.get(finding.file) ?? [];
    list.push(finding);
    byFile.set(finding.file, list);
  }

  for (const [file, findings] of byFile) {
    const path = join(root, file);
    const lines = readFileSync(path, 'utf8').split('\n');
    // Apply from the end of each line backwards so earlier columns stay valid.
    const ordered = [...findings].sort((a, b) => b.line - a.line || b.column - a.column);
    let touched = false;
    for (const f of ordered) {
      const fix = f.fix!;
      const original = fix.original!;
      const entry: AppliedFix = { file, line: f.line, column: f.column, from: original, to: fix.replacement, ruleId: f.ruleId };
      const lineText = lines[f.line - 1];
      if (lineText === undefined || lineText.slice(f.column - 1, f.column - 1 + original.length) !== original) {
        result.skipped.push({ ...entry, reason: `text at ${file}:${f.line}:${f.column} does not match "${original}"` });
        continue;
      }
      lines[f.line - 1] = lineText.slice(0, f.column - 1) + fix.replacement + lineText.slice(f.column - 1 + original.length);
      result.applied.push(entry);
      touched = true;
    }
    if (touched && !options.dryRun) writeFileSync(path, lines.join('\n'));
  }

  result.applied.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
  return result;
}
