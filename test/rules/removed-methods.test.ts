import { describe, expect, it } from 'vitest';
import { findingsOf } from './helpers.js';

const RULE = 'removed-methods';

describe(RULE, () => {
  it('flags a logging/setLevel handler', () => {
    const code = `
      import { SetLevelRequestSchema } from '@modelcontextprotocol/sdk/types.js';
      server.setRequestHandler(SetLevelRequestSchema, async ({ params }) => {
        level = params.level;
        return {};
      });
    `;
    const findings = findingsOf(RULE, { 'src/server.ts': code });
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.severity).toBe('breaking');
    expect(f.section).toBe('Major 5');
    expect(f.line).toBe(3);
    expect(f.message).toMatch(/logging\/setLevel/);
    expect(f.remediation).toMatch(/io\.modelcontextprotocol\/logLevel/);
    expect(f.fix).toBeNull();
  });

  it('flags explicit ping calls and handlers', () => {
    const code = `
      import { PingRequestSchema } from '@modelcontextprotocol/sdk/types.js';
      server.setRequestHandler(PingRequestSchema, async () => ({}));
      setInterval(() => server.server.ping(), 30_000);
      await client.ping();
    `;
    const findings = findingsOf(RULE, { 'src/server.ts': code });
    expect(findings.map((f) => f.line)).toEqual([3, 4, 5]);
    expect(findings[1]?.message).toMatch(/ping/);
  });

  it('flags the roots list_changed notification', () => {
    const code = `
      import { RootsListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
      server.setNotificationHandler(RootsListChangedNotificationSchema, async () => {});
      const n = { method: 'notifications/roots/list_changed' };
    `;
    expect(findingsOf(RULE, { 'src/server.ts': code }).map((f) => f.line)).toEqual([3, 4]);
  });

  it('flags raw method names used in hand-built messages', () => {
    const code = `
      const a = { jsonrpc: '2.0', id: 1, method: 'ping' };
      const b = { jsonrpc: '2.0', id: 2, method: 'logging/setLevel', params: { level: 'debug' } };
      if (msg.method === 'logging/setLevel') handle(msg);
    `;
    expect(findingsOf(RULE, { 'src/wire.ts': code }).map((f) => f.line)).toEqual([2, 3, 4]);
  });

  it('stays silent on ping used for something that is not MCP', () => {
    const code = `
      const redis = createClient();
      await redis.ping();
      const pong = await db.ping();
      function ping() {}
      ping();
      const url = '/health/ping';
    `;
    expect(findingsOf(RULE, { 'src/health.ts': code })).toEqual([]);
  });

  it('stays silent on a migrated server that logs per request', () => {
    const code = `
      server.registerTool('t', { description: 'd' }, async (_args, ctx) => {
        ctx.mcpReq.log('info', 'hello');
        return { content: [] };
      });
    `;
    expect(findingsOf(RULE, { 'src/server.ts': code })).toEqual([]);
  });
});
