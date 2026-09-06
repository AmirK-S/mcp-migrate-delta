import { createServer, type IncomingMessage, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_USER_AGENT, discoverRequest, initializeRequest, probeServer } from '../../src/ecosystem/probe.js';

interface Seen {
  method: string;
  headers: IncomingMessage['headers'];
  body: string;
}

const servers: Server[] = [];

afterEach(async () => {
  for (const s of servers.splice(0)) await new Promise<void>((resolve) => s.close(() => resolve()));
});

async function serve(handler: (seen: Seen) => { status: number; type: string; body: string }): Promise<{ url: string; seen: Seen[] }> {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (d: Buffer) => (body += d.toString()));
    req.on('end', () => {
      const parsed = JSON.parse(body || '{}') as { method?: string };
      const entry = { method: parsed.method ?? '', headers: req.headers, body };
      seen.push(entry);
      const out = handler(entry);
      res.statusCode = out.status;
      res.setHeader('content-type', out.type);
      res.end(out.body);
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  return { url: `http://127.0.0.1:${address.port}/mcp`, seen };
}

describe('request shapes', () => {
  it('builds the 2026-07-28 discover with the three SEP-2243 headers and per-request _meta', () => {
    const r = discoverRequest();
    expect(r.headers['mcp-protocol-version']).toBe('2026-07-28');
    expect(r.headers['mcp-method']).toBe('server/discover');
    const body = JSON.parse(r.body);
    expect(body.method).toBe('server/discover');
    expect(body.params._meta['io.modelcontextprotocol/protocolVersion']).toBe('2026-07-28');
  });

  it('builds a plain 2025-11-25 initialize', () => {
    const body = JSON.parse(initializeRequest().body);
    expect(body.method).toBe('initialize');
    expect(body.params.protocolVersion).toBe('2025-11-25');
  });
});

describe('probeServer', () => {
  it('stops after discover when the server is modern, and identifies itself', async () => {
    const { url, seen } = await serve(() => ({
      status: 200,
      type: 'application/json',
      body: '{"jsonrpc":"2.0","id":1,"result":{"supportedVersions":["2026-07-28"],"resultType":"complete"}}',
    }));
    const probe = await probeServer(url, { timeoutMs: 2_000 });
    expect(probe.verdict).toBe('modern');
    expect(seen.map((s) => s.method)).toEqual(['server/discover']);
    expect(seen[0]?.headers['user-agent']).toBe(DEFAULT_USER_AGENT);
    expect(probe.initialize).toBeUndefined();
    expect(probe.discover.status).toBe(200);
  });

  it('falls back to initialize once when discover is rejected, and never sends a third request', async () => {
    const { url, seen } = await serve((s) =>
      s.method === 'server/discover'
        ? { status: 400, type: 'application/json', body: '{"jsonrpc":"2.0","error":{"code":-32000,"message":"Bad Request: Unsupported protocol version: 2026-07-28"},"id":null}' }
        : { status: 200, type: 'text/event-stream', body: 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-11-25","capabilities":{},"serverInfo":{"name":"old","version":"1"}}}\n\n' },
    );
    const probe = await probeServer(url, { timeoutMs: 2_000 });
    expect(probe.verdict).toBe('legacy');
    expect(probe.protocolVersions).toEqual(['2025-11-25']);
    expect(probe.serverName).toBe('old');
    expect(seen.map((s) => s.method)).toEqual(['server/discover', 'initialize']);
    expect(probe.initialize?.status).toBe(200);
  });

  it('stops after a 401 without sending initialize', async () => {
    const { url, seen } = await serve(() => ({ status: 401, type: 'text/plain', body: 'unauthorized' }));
    const probe = await probeServer(url, { timeoutMs: 2_000 });
    expect(probe.verdict).toBe('auth-required');
    expect(seen).toHaveLength(1);
  });

  it('reports a closed port as unreachable after one attempt', async () => {
    const probe = await probeServer('http://127.0.0.1:1/mcp', { timeoutMs: 2_000 });
    expect(probe.verdict).toBe('unreachable');
    expect(probe.discover.status).toBeNull();
  });

  it('does not hang on a server that streams forever', async () => {
    const server = createServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader('content-type', 'text/event-stream');
      res.write(': ping\n');
      // never ends
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    const started = Date.now();
    const probe = await probeServer(`http://127.0.0.1:${address.port}/mcp`, { timeoutMs: 800 });
    expect(Date.now() - started).toBeLessThan(4_000);
    expect(probe.verdict).toBe('other');
  }, 10_000);
});
