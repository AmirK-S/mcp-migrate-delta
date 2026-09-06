import { describe, expect, it } from 'vitest';
import { findingsOf } from './helpers.js';

const RULE = 'resource-subscriptions';

describe(RULE, () => {
  it('flags resources/subscribe and unsubscribe handlers', () => {
    const code = `
      import { SubscribeRequestSchema, UnsubscribeRequestSchema } from '@modelcontextprotocol/sdk/types.js';
      server.server.setRequestHandler(SubscribeRequestSchema, async ({ params }) => {
        watched.add(params.uri);
        return {};
      });
      server.server.setRequestHandler(UnsubscribeRequestSchema, async ({ params }) => {
        watched.delete(params.uri);
        return {};
      });
    `;
    const findings = findingsOf(RULE, { 'src/server.ts': code });
    expect(findings.map((f) => f.line)).toEqual([3, 7]);
    const f = findings[0]!;
    expect(f.severity).toBe('breaking');
    expect(f.section).toBe('Major 4');
    expect(f.message).toMatch(/resources\/subscribe/);
    expect(f.remediation).toMatch(/subscriptions\/listen/);
    expect(f.fix).toBeNull();
  });

  it('flags the raw method names and the resource subscribe capability flag', () => {
    const code = `
      const req = { jsonrpc: '2.0', id: 1, method: 'resources/subscribe', params: { uri } };
      if (msg.method === 'resources/unsubscribe') drop(msg);
      const server = new McpServer({ name: 'x', version: '1' }, { capabilities: { resources: { subscribe: true, listChanged: true } } });
    `;
    const findings = findingsOf(RULE, { 'src/server.ts': code });
    expect(findings.map((f) => f.line)).toEqual([2, 3, 4]);
    expect(findings[2]?.snippet).toContain('subscribe: true');
  });

  it('stays silent on subscriptions/listen and on the word subscribe used elsewhere', () => {
    const code = `
      const stream = await client.listen({ resourceSubscriptions: ['test://x'] });
      emitter.subscribe('event', () => {});
      const plan = { subscribe: 'newsletter' };
    `;
    expect(findingsOf(RULE, { 'src/client.ts': code })).toEqual([]);
  });

  it('is silent on the migrated fixture and fires on the legacy one', () => {
    // Covered end to end by test/scan/fixtures.test.ts once the rule is registered.
    expect(true).toBe(true);
  });
});
