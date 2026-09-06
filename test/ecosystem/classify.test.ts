import { describe, expect, it } from 'vitest';
import { classify, parseJsonRpcBody, type HttpOutcome } from '../../src/ecosystem/classify.js';

const ok = (status: number, body: string, contentType = 'application/json'): HttpOutcome => ({
  kind: 'response',
  status,
  contentType,
  body,
});
const dead = (error: string): HttpOutcome => ({ kind: 'error', error });

// Bodies captured on 05 September 2026 against real SDKs (recherche/raw/stampage).
const V2_DISCOVER =
  '{"result":{"supportedVersions":["2026-07-28"],"capabilities":{"tools":{"listChanged":true}},"resultType":"complete","ttlMs":0,"cacheScope":"private","_meta":{"io.modelcontextprotocol/serverInfo":{"name":"stampage-probe","version":"1.0.0"}}},"jsonrpc":"2.0","id":1}';
const V1_DISCOVER_400 =
  '{"jsonrpc":"2.0","error":{"code":-32000,"message":"Bad Request: Unsupported protocol version: 2026-07-28 (supported versions: 2025-11-25, 2025-06-18, 2025-03-26, 2024-11-05, 2024-10-07)"},"id":null}';
const V1_INITIALIZE_SSE =
  'event: message\ndata: {"result":{"protocolVersion":"2025-11-25","capabilities":{"tools":{}},"serverInfo":{"name":"before","version":"1.0.0"}},"jsonrpc":"2.0","id":1}\n\n';
const V1_DISCOVER_NOHEADER_SSE = 'event: message\ndata: {"jsonrpc":"2.0","id":5,"error":{"code":-32601,"message":"Method not found"}}\n\n';

describe('parseJsonRpcBody', () => {
  it('reads a plain JSON body', () => {
    expect(parseJsonRpcBody(V2_DISCOVER, 'application/json')?.result).toMatchObject({ supportedVersions: ['2026-07-28'] });
  });

  it('reads the first data line of an SSE body', () => {
    expect(parseJsonRpcBody(V1_INITIALIZE_SSE, 'text/event-stream')?.result).toMatchObject({ protocolVersion: '2025-11-25' });
  });

  it('returns null for HTML or garbage', () => {
    expect(parseJsonRpcBody('<html><body>404</body></html>', 'text/html')).toBeNull();
    expect(parseJsonRpcBody('', 'application/json')).toBeNull();
  });
});

describe('classify', () => {
  it('reports a server that answers server/discover with 2026-07-28 as modern', () => {
    const v = classify({ discover: ok(200, V2_DISCOVER) });
    expect(v.verdict).toBe('modern');
    expect(v.protocolVersions).toEqual(['2026-07-28']);
    expect(v.serverName).toBe('stampage-probe');
  });

  it('reports a 2025-11-25 server as legacy, with the version it negotiated', () => {
    const v = classify({ discover: ok(400, V1_DISCOVER_400), initialize: ok(200, V1_INITIALIZE_SSE, 'text/event-stream') });
    expect(v.verdict).toBe('legacy');
    expect(v.protocolVersions).toEqual(['2025-11-25']);
    expect(v.serverName).toBe('before');
  });

  it('reports legacy even when discover is answered with method not found instead of a version error', () => {
    const v = classify({
      discover: ok(200, V1_DISCOVER_NOHEADER_SSE, 'text/event-stream'),
      initialize: ok(200, V1_INITIALIZE_SSE, 'text/event-stream'),
    });
    expect(v.verdict).toBe('legacy');
  });

  it('reports 401 and 403 as auth-required without trying to read further', () => {
    expect(classify({ discover: ok(401, '', 'text/plain') }).verdict).toBe('auth-required');
    expect(classify({ discover: ok(403, '{"error":"forbidden"}') }).verdict).toBe('auth-required');
  });

  it('reports a connection failure or timeout as unreachable', () => {
    const v = classify({ discover: dead('fetch failed (ECONNREFUSED)') });
    expect(v.verdict).toBe('unreachable');
    expect(v.detail).toContain('ECONNREFUSED');
  });

  it('reports anything that is not MCP on either request as other, with what was seen', () => {
    const v = classify({ discover: ok(404, '<html>nope</html>', 'text/html'), initialize: ok(404, '<html>nope</html>', 'text/html') });
    expect(v.verdict).toBe('other');
    expect(v.detail).toMatch(/404/);
  });

  it('never calls a server modern on a 2xx that carries no supportedVersions', () => {
    const v = classify({ discover: ok(200, '{"jsonrpc":"2.0","id":1,"result":{}}'), initialize: ok(500, 'boom', 'text/plain') });
    expect(v.verdict).toBe('other');
  });

  it('keeps both versions when a server lists several', () => {
    const body = '{"jsonrpc":"2.0","id":1,"result":{"supportedVersions":["2025-11-25","2026-07-28"],"resultType":"complete"}}';
    const v = classify({ discover: ok(200, body) });
    expect(v.verdict).toBe('modern');
    expect(v.protocolVersions).toEqual(['2025-11-25', '2026-07-28']);
  });
});
