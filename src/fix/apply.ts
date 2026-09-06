import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
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
  dryRun: boolean;
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
  const result: FixResult = { dryRun: options.dryRun, applied: [], skipped: [], remaining: [] };
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
    const path = resolve(root, file);
    const rel = relative(resolve(root), path);
    if (rel.startsWith('..') || rel.split(sep).includes('..')) {
      // A report handed to the API could name a path outside the scanned root; never write there.
      for (const f of findings) {
        result.skipped.push({ file, line: f.line, column: f.column, from: f.fix!.original!, to: f.fix!.replacement, ruleId: f.ruleId, reason: `path ${file} is outside ${root}` });
      }
      continue;
    }
    const raw = readFileSync(path, 'utf8');
    // ts-morph strips a leading BOM before counting columns; keep it out of the offsets and
    // put it back on write, or every finding on line 1 would be off by one character.
    const bom = raw.startsWith('\uFEFF') ? '\uFEFF' : '';
    const lines = raw.slice(bom.length).split('\n');
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
    if (touched && !options.dryRun) writeFileSync(path, bom + lines.join('\n'));
  }

  result.applied.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
  return result;
}
