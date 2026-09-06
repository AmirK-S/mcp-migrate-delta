/**
 * Classification of a public server from two requests at most: a 2026-07-28 `server/discover`,
 * then, if that did not settle it, a 2025-11-25 `initialize`. Nothing else is ever sent.
 */

export type HttpOutcome =
  | { kind: 'response'; status: number; contentType: string; body: string; headers?: Record<string, string> }
  | { kind: 'error'; error: string };

/**
 * - `modern`: declares 2026-07-28, in `supportedVersions` or in the `data.supported` of a -32022.
 * - `modern-other-revision`: declares versions on the modern wire, none of them 2026-07-28.
 * - `modern-no-discover`: answers 404 with a JSON-RPC -32601, the modern shape for an unknown
 *   method, on a method the revision says servers MUST implement.
 * - `legacy`: negotiates a 2025-11-25 or earlier `initialize`.
 * - `auth-required`: 401, or 403 carrying WWW-Authenticate (a bare 403 is also how a server
 *   refuses an Origin, so it is not read as auth).
 * - `rate-limited`: 429, never retried.
 * - `unreachable`: no HTTP answer, or 5xx.
 * - `other`: answered, but nothing above applies; the detail says what was seen.
 */
export type Verdict =
  | 'modern'
  | 'modern-other-revision'
  | 'modern-no-discover'
  | 'legacy'
  | 'auth-required'
  | 'rate-limited'
  | 'unreachable'
  | 'other';

const MODERN = '2026-07-28';

export interface Classification {
  verdict: Verdict;
  /** Versions the server declared: `supportedVersions` of discover, or the negotiated `protocolVersion`. */
  protocolVersions: string[];
  serverName?: string;
  detail: string;
}

interface JsonRpcBody {
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string };
}

/** Parses a JSON body, or the first `data:` line of an SSE body. Null when it is neither. */
export function parseJsonRpcBody(body: string, contentType: string): JsonRpcBody | null {
  const text = body.trim();
  if (text === '') return null;
  let candidate = text;
  if (contentType.includes('text/event-stream') || text.startsWith('event:') || text.startsWith('data:')) {
    const line = text.split(/\r?\n/).find((l) => l.startsWith('data:'));
    if (!line) return null;
    candidate = line.slice('data:'.length).trim();
  }
  try {
    const parsed: unknown = JSON.parse(candidate);
    return parsed && typeof parsed === 'object' ? (parsed as JsonRpcBody) : null;
  } catch {
    return null;
  }
}

export function classify(outcomes: { discover: HttpOutcome; initialize?: HttpOutcome }): Classification {
  const { discover, initialize } = outcomes;

  if (discover.kind === 'error') {
    return { verdict: 'unreachable', protocolVersions: [], detail: discover.error };
  }
  if (isAuthRefusal(discover)) {
    return { verdict: 'auth-required', protocolVersions: [], detail: `HTTP ${discover.status} on server/discover` };
  }
  if (discover.status === 429) {
    return { verdict: 'rate-limited', protocolVersions: [], detail: 'HTTP 429 on server/discover, not retried' };
  }
  if (discover.status >= 500) {
    return { verdict: 'unreachable', protocolVersions: [], detail: `HTTP ${discover.status} on server/discover` };
  }

  const discovered = parseJsonRpcBody(discover.body, discover.contentType);
  const versions = discovered?.result?.['supportedVersions'];
  if (isStringList(versions)) {
    const name = serverInfoName(discovered?.result);
    return {
      verdict: versions.includes(MODERN) ? 'modern' : 'modern-other-revision',
      protocolVersions: versions,
      ...(name ? { serverName: name } : {}),
      detail: `server/discover answered HTTP ${discover.status} with supportedVersions`,
    };
  }
  const code = discovered?.error?.code;
  const supported = (discovered?.error as { data?: { supported?: unknown } } | undefined)?.data?.supported;
  if (code === -32022 && isStringList(supported)) {
    return {
      verdict: supported.includes(MODERN) ? 'modern' : 'modern-other-revision',
      protocolVersions: supported,
      detail: `server/discover rejected with -32022 listing data.supported`,
    };
  }
  if (discover.status === 404 && code === -32601) {
    return {
      verdict: 'modern-no-discover',
      protocolVersions: [],
      detail: 'HTTP 404 with JSON-RPC -32601 on server/discover, which 2026-07-28 says servers MUST implement',
    };
  }

  if (initialize) {
    if (initialize.kind === 'error') {
      return { verdict: 'unreachable', protocolVersions: [], detail: `initialize: ${initialize.error}` };
    }
    if (isAuthRefusal(initialize)) {
      return { verdict: 'auth-required', protocolVersions: [], detail: `HTTP ${initialize.status} on initialize` };
    }
    if (initialize.status === 429) {
      return { verdict: 'rate-limited', protocolVersions: [], detail: 'HTTP 429 on initialize, not retried' };
    }
    const init = parseJsonRpcBody(initialize.body, initialize.contentType);
    const negotiated = init?.result?.['protocolVersion'];
    if (typeof negotiated === 'string') {
      const info = init?.result?.['serverInfo'];
      const name = info && typeof info === 'object' ? (info as { name?: unknown }).name : undefined;
      return {
        verdict: 'legacy',
        protocolVersions: [negotiated],
        ...(typeof name === 'string' ? { serverName: name } : {}),
        detail: `server/discover HTTP ${discover.status}${describeError(discovered)}; initialize negotiated ${negotiated}`,
      };
    }
    return {
      verdict: 'other',
      protocolVersions: [],
      detail: `server/discover HTTP ${discover.status}${describeError(discovered)}; initialize HTTP ${initialize.status} ${initialize.contentType || 'no content type'}`,
    };
  }

  return {
    verdict: 'other',
    protocolVersions: [],
    detail: `server/discover HTTP ${discover.status}${describeError(discovered)}, no initialize attempted`,
  };
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string');
}

function isAuthRefusal(outcome: Extract<HttpOutcome, { kind: 'response' }>): boolean {
  if (outcome.status === 401) return true;
  if (outcome.status !== 403) return false;
  const headers = outcome.headers ?? {};
  return Object.keys(headers).some((h) => h.toLowerCase() === 'www-authenticate');
}

function describeError(body: JsonRpcBody | null): string {
  if (!body?.error) return '';
  const code = body.error.code !== undefined ? ` ${body.error.code}` : '';
  const message = body.error.message ? ` ${body.error.message.slice(0, 80)}` : '';
  return ` (error${code}${message})`;
}

function serverInfoName(result: Record<string, unknown> | undefined): string | undefined {
  const meta = result?.['_meta'];
  if (!meta || typeof meta !== 'object') return undefined;
  const info = (meta as Record<string, unknown>)['io.modelcontextprotocol/serverInfo'];
  if (!info || typeof info !== 'object') return undefined;
  const name = (info as { name?: unknown }).name;
  return typeof name === 'string' ? name : undefined;
}
