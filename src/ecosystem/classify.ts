/**
 * Classification of a public server from two requests at most: a 2026-07-28 `server/discover`,
 * then, if that did not settle it, a 2025-11-25 `initialize`. Nothing else is ever sent.
 */

export type HttpOutcome =
  | { kind: 'response'; status: number; contentType: string; body: string }
  | { kind: 'error'; error: string };

export type Verdict = 'modern' | 'legacy' | 'auth-required' | 'unreachable' | 'other';

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
  if (discover.status === 401 || discover.status === 403) {
    return { verdict: 'auth-required', protocolVersions: [], detail: `HTTP ${discover.status} on server/discover` };
  }

  const discovered = parseJsonRpcBody(discover.body, discover.contentType);
  const versions = discovered?.result?.['supportedVersions'];
  if (Array.isArray(versions) && versions.every((v) => typeof v === 'string') && versions.length > 0) {
    const name = serverInfoName(discovered?.result);
    return {
      verdict: 'modern',
      protocolVersions: versions as string[],
      ...(name ? { serverName: name } : {}),
      detail: `server/discover answered HTTP ${discover.status} with supportedVersions`,
    };
  }

  if (initialize) {
    if (initialize.kind === 'error') {
      return { verdict: 'unreachable', protocolVersions: [], detail: `initialize: ${initialize.error}` };
    }
    if (initialize.status === 401 || initialize.status === 403) {
      return { verdict: 'auth-required', protocolVersions: [], detail: `HTTP ${initialize.status} on initialize` };
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
