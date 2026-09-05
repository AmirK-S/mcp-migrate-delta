import { describe, expect, it } from 'vitest';
import { findingsOf } from './helpers.js';

const RULE = 'stateful-handshake';

describe(RULE, () => {
  it('flags a stateful transport created with sessionIdGenerator', () => {
    const code = `
      import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
      import { randomUUID } from 'node:crypto';
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });
    `;
    const findings = findingsOf(RULE, { 'src/server.ts': code });
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.severity).toBe('breaking');
    expect(f.section).toBe('Major 1, Major 2');
    expect(f.file).toBe('src/server.ts');
    expect(f.line).toBe(5);
    expect(f.snippet).toContain('sessionIdGenerator');
    expect(f.remediation).toMatch(/createMcpHandler/);
    expect(f.fix).toBeNull();
  });

  it('flags reads and writes of the Mcp-Session-Id header, case insensitively', () => {
    const code = `
      app.post('/mcp', async (req, res) => {
        const sid = req.headers['mcp-session-id'];
        const other = req.header('Mcp-Session-Id');
        res.setHeader('MCP-Session-Id', sid);
      });
    `;
    const findings = findingsOf(RULE, { 'src/server.ts': code });
    expect(findings.map((f) => f.line)).toEqual([3, 4, 5]);
  });

  it('flags explicit initialize handling', () => {
    const code = `
      import { InitializeRequestSchema, InitializedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
      server.setRequestHandler(InitializeRequestSchema, async () => ({}));
      server.setNotificationHandler(InitializedNotificationSchema, async () => {});
      server.oninitialized = () => console.log('ready');
      const raw = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} };
      const note = { jsonrpc: '2.0', method: 'notifications/initialized' };
    `;
    const findings = findingsOf(RULE, { 'src/server.ts': code });
    expect(findings.map((f) => f.line)).toEqual([3, 4, 5, 6, 7]);
  });

  it('does not count the import line itself as a usage', () => {
    const code = `
      import { InitializeRequestSchema } from '@modelcontextprotocol/sdk/types.js';
      server.setRequestHandler(InitializeRequestSchema, async () => ({}));
    `;
    expect(findingsOf(RULE, { 'src/server.ts': code }).map((f) => f.line)).toEqual([3]);
  });

  it('flags an import that is never used, once, on the import line', () => {
    const code = `import { InitializeRequestSchema } from '@modelcontextprotocol/sdk/types.js';\nexport {};\n`;
    expect(findingsOf(RULE, { 'src/server.ts': code }).map((f) => f.line)).toEqual([1]);
  });

  it('stays silent on the word initialize used for something else', () => {
    const code = `
      function initialize() { return 1; }
      const method = 'initialize-cache';
      const s = { initialize: true };
      initialize();
    `;
    expect(findingsOf(RULE, { 'src/other.ts': code })).toEqual([]);
  });

  it('stays silent on a migrated server', () => {
    const code = `
      import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
      export const handler = createMcpHandler(() => new McpServer({ name: 'demo', version: '1.0.0' }));
    `;
    expect(findingsOf(RULE, { 'src/server.ts': code })).toEqual([]);
  });

  it('scans JavaScript files as well as TypeScript', () => {
    const code = `const t = new StreamableHTTPServerTransport({ sessionIdGenerator: () => 'x' });\n`;
    expect(findingsOf(RULE, { 'src/server.mjs': code })).toHaveLength(1);
  });
});
