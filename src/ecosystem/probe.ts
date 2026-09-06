import { TOOL_VERSION } from '../version.js';
import { classify, type Classification, type HttpOutcome } from './classify.js';

export interface ProbeOptions {
  timeoutMs?: number;
  /** Pause between the two requests of one server. */
  pauseMs?: number;
  userAgent?: string;
  /** Sent on both requests, for example an identifying contact. */
  extraHeaders?: Record<string, string>;
}

export interface ServerProbe extends Classification {
  url: string;
  probedAt: string;
  durationMs: number;
  discover: { status: number | null; contentType?: string };
  initialize?: { status: number | null; contentType?: string };
}

export const DEFAULT_USER_AGENT = `mcp-migrate-delta/${TOOL_VERSION} (+https://github.com/AmirK-S/mcp-migrate-delta)`;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_PAUSE_MS = 5_000;
const MODERN = '2026-07-28';
const LEGACY = '2025-11-25';

/** The 2026-07-28 probe the revision itself designates: server/discover, no state, nothing else. */
export function discoverRequest(): { headers: Record<string, string>; body: string } {
  return {
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': MODERN,
      'mcp-method': 'server/discover',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'server/discover',
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': MODERN,
          'io.modelcontextprotocol/clientCapabilities': {},
          'io.modelcontextprotocol/clientInfo': { name: 'mcp-migrate-delta', version: TOOL_VERSION },
        },
      },
    }),
  };
}

/** The 2025-11-25 handshake opener. The session it may open is never used afterwards. */
export function initializeRequest(): { headers: Record<string, string>; body: string } {
  return {
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LEGACY,
        capabilities: {},
        clientInfo: { name: 'mcp-migrate-delta', version: TOOL_VERSION },
      },
    }),
  };
}

/**
 * Classifies one server with at most two POST requests and no retry. A server that answers
 * discover with its versions, or that rejects with 401 or 403, or that cannot be reached, is
 * settled by the first request alone.
 */
export async function probeServer(url: string, options: ProbeOptions = {}): Promise<ServerProbe> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const common = { 'user-agent': options.userAgent ?? DEFAULT_USER_AGENT, ...options.extraHeaders };
  const started = performance.now();
  const probedAt = new Date().toISOString();

  const discover = await send(url, discoverRequest(), common, timeoutMs);
  let initialize: HttpOutcome | undefined;
  const settled = classify({ discover });
  if (settled.verdict === 'other') {
    await new Promise((r) => setTimeout(r, options.pauseMs ?? DEFAULT_PAUSE_MS));
    initialize = await send(url, initializeRequest(), common, timeoutMs);
  }
  const classification = initialize ? classify({ discover, initialize }) : settled;

  const probe: ServerProbe = {
    url,
    probedAt,
    durationMs: Math.round(performance.now() - started),
    ...classification,
    discover: summarise(discover),
  };
  if (initialize) probe.initialize = summarise(initialize);
  return probe;
}

async function send(
  url: string,
  request: { headers: Record<string, string>; body: string },
  common: Record<string, string>,
  timeoutMs: number,
): Promise<HttpOutcome> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { ...request.headers, ...common },
      body: request.body,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const e = err as Error & { cause?: unknown };
    const cause = e.cause instanceof Error ? ` (${e.cause.message})` : '';
    return { kind: 'error', error: `${e.name === 'TimeoutError' ? 'timeout' : e.message}${cause}` };
  }
  const contentType = response.headers.get('content-type') ?? '';
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => (headers[key] = value));
  // Headers arrived, so the server answered: whatever happens to the body, this is a response.
  // Read at most the first chunk of an SSE stream, then drop the connection.
  const body = (await readSome(response, timeoutMs).catch(() => '')).slice(0, 4096);
  return { kind: 'response', status: response.status, contentType, body, headers };
}

async function readSome(response: Response, timeoutMs: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline && text.length < 64_000) {
      const { value, done } = await Promise.race([
        reader.read(),
        new Promise<{ value: undefined; done: true }>((resolve) => setTimeout(() => resolve({ value: undefined, done: true }), Math.max(1, deadline - Date.now()))),
      ]);
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (/\n\n/.test(text) || text.trimEnd().endsWith('}')) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return text;
}

function summarise(outcome: HttpOutcome): { status: number | null; contentType?: string } {
  return outcome.kind === 'response' ? { status: outcome.status, contentType: outcome.contentType } : { status: null };
}
