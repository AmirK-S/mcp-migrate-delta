import { describe, expect, it } from 'vitest';
import { findingsOf } from './helpers.js';

const RULE = 'error-codes';

describe(RULE, () => {
  it('flags the 2025-11-25 resource not found code with a safe replacement', () => {
    const code = `
      import { McpError } from '@modelcontextprotocol/sdk/types.js';
      throw new McpError(-32002, 'Resource not found: ' + uri);
    `;
    const findings = findingsOf(RULE, { 'src/resources.ts': code });
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.severity).toBe('breaking');
    expect(f.section).toBe('Minor 6');
    expect(f.line).toBe(3);
    expect(f.column).toBeGreaterThan(0);
    expect(f.snippet).toContain('-32002');
    expect(f.fix).toEqual({ confidence: 'safe', replacement: '-32602', original: '-32002' });
  });

  it('flags the code inside a hand-built error object', () => {
    const code = `
      res.json({ jsonrpc: '2.0', id, error: { code: -32002, message: 'not found' } });
    `;
    expect(findingsOf(RULE, { 'src/wire.ts': code }).map((f) => f.line)).toEqual([2]);
  });

  it('flags the URL elicitation code as review only, since MRTR removed it', () => {
    const code = `throw new McpError(-32042, 'URL elicitation required', { elicitations });\n`;
    const findings = findingsOf(RULE, { 'src/elicit.ts': code });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('advisory');
    expect(findings[0]?.fix).toBeNull();
    expect(findings[0]?.remediation).toMatch(/input_required|InputRequiredResult/);
  });

  it('stays silent on the implementation-defined range and on the new codes', () => {
    const code = `
      const a = -32000;
      const b = -32001;
      const c = -32020;
      const d = -32602;
      const e = 32002;
      const f = -320020;
    `;
    expect(findingsOf(RULE, { 'src/codes.ts': code })).toEqual([]);
  });
});
