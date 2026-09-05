export type ProbeResult = { reachable: true; status: number } | { reachable: false; error: string };

/**
 * Checks that something answers HTTP at `url` before the suite is started.
 *
 * The conformance suite exits 1 both for a conformance failure and for a dead server, so
 * without this probe a stopped server would read as a total regression. Any HTTP status
 * counts as reachable: a 2025-11-25 server answers 400 to a 2026-07-28 request, and that
 * is precisely the server we want to measure.
 */
export async function probeUrl(url: string, timeoutMs: number): Promise<ProbeResult> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json, text/event-stream' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    // Drain so the socket is released; the body is irrelevant.
    await response.arrayBuffer().catch(() => undefined);
    return { reachable: true, status: response.status };
  } catch (err) {
    return { reachable: false, error: describeError(err) };
  }
}

function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: unknown }).cause;
  const causeText = cause instanceof Error ? ` (${cause.message})` : '';
  return `${err.message}${causeText}`;
}
