# mcp-migrate-delta

Measure what Model Context Protocol revision `2026-07-28` breaks in a TypeScript server
written for `2025-11-25`, and prove the migration with the official conformance suite,
run for real, before and after.

> **Dated tool.** This tool is bound to specification revision `2026-07-28` and to
> `@modelcontextprotocol/conformance` `0.2.0-alpha.11`, pinned exactly. The next
> revision of the protocol will make it obsolete: at the time of writing (05 September 2026)
> the `draft` branch of the specification carries no changelog entry and a schema identical
> to `2026-07-28`, and the lifecycle policy adopted in `2026-07-28` (SEP-2596) fixes a minimum
> deprecation window of twelve months. When a `2027-*` revision ships, `verify` keeps
> measuring `2026-07-28` as long as the suite ships its frozen requirements file, and the scan
> rules stay true about `2025-11-25` code but say nothing about the new revision.

## Why

Static scanners for this migration already exist (on PyPI `mcp-migrate` and `mcp-codemod`,
on npm `mcp-stateless-migrator` and `efaimo`, plus agent skills on GitHub). None of them
proves anything: a scanner that verifies its own rewrite with the regular expressions that
produced it verifies nothing. The proof that a migration worked is the official suite, `npx
@modelcontextprotocol/conformance server --requirements 2026-07-28`, run against the server
before and after, and the difference between the two runs. That difference is what this
tool computes, check by check, with an exit code that fails on any regression.

The scanner half is deliberately small: four rules, each mapped to an entry of the
`2026-07-28` changelog, tuned for zero false positives on a migrated server rather than for
coverage. It tells you what will break; `verify` tells you whether it did.

## Install

```bash
npm install --save-dev mcp-migrate-delta
# or run it once
npx mcp-migrate-delta --help
```

Node 22 or later. The package depends on `@modelcontextprotocol/conformance@0.2.0-alpha.11`
and runs that exact version; it never resolves the `latest` tag, which at the time of
writing still points to `0.1.16` (March 2026), a release that does not know `--requirements`.

## Quick start

```bash
# 1. What will break, statically.
mcp-migrate-delta scan ./src

# 2. Baseline: the official suite against the server as it is today.
mcp-migrate-delta verify --url http://localhost:3000/mcp --report before.json

# 3. Migrate (change of package, see below), restart the server, then measure the delta.
mcp-migrate-delta verify --url http://localhost:3000/mcp --baseline before.json --report delta.json
```

Or see the whole thing on the bundled servers in one command: `npm run demo`.

`verify --baseline` exits `1` if any check of a scored scenario went from `SUCCESS` to
`FAILURE`, and `0` otherwise, even when failures remain. It is a regression gate, not a
conformance badge: the suite's own exit code is that badge, and it is reported alongside.

## A real run

The repository ships two servers with the same domain surface, each written for its own
revision: `fixtures/before` on `@modelcontextprotocol/sdk` `1.30.0`, revision `2025-11-25`
(15 tools, 4 prompts, 3 resources, 1 template), and `fixtures/after` migrated by hand to
`@modelcontextprotocol/server` `2.0.0`, revision `2026-07-28` (20 tools, 5 prompts,
2 resources, 1 template). The two surfaces cannot be identical: the elicitation, sampling
and roots tools of `2025-11-25` have no same-named counterpart once server-initiated
requests become multi round-trip results, and the subscribed resource disappears with
`resources/subscribe`. That is what the `9 added, 4 removed` checks of the delta below
account for. Everything else keeps the same tool, prompt and resource names with the same
contents. Everything below is the actual output on 05 September 2026, abridged where a
`...` marks a cut, with the absolute scan path shortened.

```bash
PORT=3001 node fixtures/before/src/server.mjs &
PORT=3002 node fixtures/after/src/server.mjs &
```

### `scan` on the server before migration

```
$ mcp-migrate-delta scan fixtures/before
mcp-migrate-delta 0.1.0 scan of fixtures/before
Revision 2025-11-25 to 2026-07-28, 2 file(s), 4 rule(s)

package.json
  11:5  breaking sdk-v1-package [Major 2, Major 3]
      dependencies pins @modelcontextprotocol/sdk at "1.30.0", a 1.x line that cannot serve revision 2026-07-28.
      "@modelcontextprotocol/sdk": "1.30.0",
src/server.mjs
  74:37  breaking removed-methods [Major 5]
      Handles logging/setLevel through SetLevelRequestSchema; the method is removed in 2026-07-28.
      server.server.setRequestHandler(SetLevelRequestSchema, async request => {
  80:37  breaking removed-methods [Major 5]
      Handles ping through PingRequestSchema; the method is removed in 2026-07-28.
      server.server.setRequestHandler(PingRequestSchema, async () => ({}));
  88:32  breaking error-codes [Minor 6]
      Uses -32002 for resource not found; 2026-07-28 expects -32602.
      throw new McpError(-32002, `Resource not found: ${uri}`, { uri });
  fix (safe): -32602
  103:5  breaking stateful-handshake [Major 1, Major 2]
      Hooks oninitialized; the initialize handshake no longer exists in 2026-07-28.
      server.server.oninitialized = () => {
  ...
  542:9  breaking stateful-handshake [Major 1, Major 2]
      Transport mints a session id with sessionIdGenerator; 2026-07-28 has no protocol sessions.
      sessionIdGenerator: () => randomUUID(),
  ...

10 breaking, 0 advisory
2 finding(s) have a safe mechanical replacement, shown inline.
```

Exit code `1`. The same command on `fixtures/after` prints `No finding` and exits `0`.

### `verify` on the server before migration

```
$ mcp-migrate-delta verify --url http://localhost:3001/mcp --report before.json
@modelcontextprotocol/conformance@0.2.0-alpha.11 --requirements 2026-07-28 against http://localhost:3001/mcp
0.54 s, suite exit code 1

Scored scenarios: 1 passed, 36 failed, 0 crashed, 0 empty, 37 total
Not scored: 0 passed, 11 failed, 1 crashed, 1 empty (never count)
Checks: 11 success, 145 failure, 5 warning, 4 skipped, 1 info

Failing scored scenarios:
  fail    server-stateless (26 failing checks)
  fail    completion-complete (2 failing checks)
  fail    tools-list (2 failing checks)
  ...

1 scenario(s) left no checks.json; the suite crashed on them and would have counted them silently.

Root causes, by failing checks:
    47  Bad Request: server not initialized  [34 scenario(s)]
    25  [implementation] response to 'tools/call' (spec 2026-07-28): JSONRPCErrorResponse/id: must be string,integer  [25 scenario(s)]
  ...
     5  Expected HTTP 404 and code -32601 for removed methods, got HTTP 400 and code -32000  [1 scenario(s)]
     3  Expected error code -32602, got -32000  [1 scenario(s)]
  ...
```

Thirty-six of thirty-seven scored scenarios fail, and the root cause grouping says why in
one line: a `2025-11-25` transport refuses every stateless request. The same server passes
30 of 30 scored scenarios under `--requirements 2025-11-25`. It is a correct server of its
revision; the revision moved.

### `verify --baseline` on the server after migration

```
$ mcp-migrate-delta verify --url http://localhost:3002/mcp --baseline before.json --report delta.json
@modelcontextprotocol/conformance@0.2.0-alpha.11 --requirements 2026-07-28 against http://localhost:3002/mcp
2.15 s, suite exit code 0

Scored scenarios: 37 passed, 0 failed, 0 crashed, 0 empty, 37 total
Not scored: 1 passed, 11 failed, 0 crashed, 1 empty (never count)
Checks: 147 success, 36 failure, 0 warning, 1 skipped, 1 info
  ...

Delta on --requirements 2026-07-28
  baseline: http://localhost:3001/mcp (2026-09-05T18:25:33.503Z)
  current:  http://localhost:3002/mcp (2026-09-05T18:25:34.577Z)

Scored scenarios failing: 36 before, 0 after
Checks: 91 fixed, 0 regressed, 0 still failing, 9 added, 4 removed

Scenario outcomes that changed:
  server-stateless: fail to pass
  completion-complete: fail to pass
  ...

Verdict: strict improvement, no regression, exit 0.
```

The 36 not scored failures after migration are the `io.modelcontextprotocol/tasks`
extension scenarios and two `pending` scenarios; the requirements file itself says they
never count, and the report keeps them apart.

## What `verify` handles for you

The suite is built for humans and for CI badges, not for programs. Observed on
`0.2.0-alpha.11`, and worked around here:

- **The exit code is `1` for a failing check, a usage error and a dead server alike.**
  `verify` probes the URL first and exits `2` with a message when nothing answers, so a
  stopped server never reads as a total regression.
- **Nothing is written without `-o`.** The README of the suite says results land in
  `results/`; they do only with `--output-dir`. `verify` always passes it, reads the
  `checks.json` files back, and keeps them when you pass `--output-dir` yourself.
- **A scenario the suite crashes on leaves an empty result directory, without `checks.json`,**
  while the terminal summary counts it as failed. Counting directories looks complete;
  counting files does not. `verify` lines the `checks.json` files up against the
  `requirements/<revision>.yaml` file the package ships and reports the missing ones as
  `crashed`.
- **A scenario can be green with zero checks executed.** Reported as `empty`.
- **Not scored scenarios fail without affecting conformance.** Reported apart, never counted.
- **The oracle before migration is flat.** Failures are grouped by normalised error
  message so that 145 failing checks read as one cause.

## The rules

| Rule | Severity | Changelog | Detects |
| --- | --- | --- | --- |
| `sdk-v1-package` | breaking | Major 2, Major 3 | A manifest depending on `@modelcontextprotocol/sdk` 1.x. The 1.x line serves `2025-11-25` at most: no `server/discover`, `2026-07-28` rejected as unsupported. Every other rule presupposes this one. |
| `stateful-handshake` | breaking | Major 1, Major 2 | `sessionIdGenerator` on a Streamable HTTP transport, the `Mcp-Session-Id` header, `InitializeRequestSchema`, `InitializedNotificationSchema`, `oninitialized`, and `initialize` or `notifications/initialized` used as a method name. |
| `removed-methods` | breaking | Major 5 | `SetLevelRequestSchema`, `PingRequestSchema`, `RootsListChangedNotificationSchema`, `.ping()` on a server or client, and `ping`, `logging/setLevel`, `notifications/roots/list_changed` used as method names. |
| `error-codes` | breaking | Minor 6 | `-32002` for resource not found, with a safe replacement by `-32602`. Also flags `-32042` (URL elicitation required, `2025-11-25` only) as advisory: the multi round-trip pattern replaces it, there is no mechanical rewrite. |

What is deliberately **not** a rule: the renumbering `-32001` to `-32020`, `-32003` to
`-32021`, `-32004` to `-32022` of Minor 12. Those codes were introduced in the `2026-07-28`
draft itself and never existed in `2025-11-25`; in 1.x code `-32001` is the SDK's own
`RequestTimeout`, and the changelog keeps `-32000` to `-32019` implementation-defined. A
rule rewriting them would be a guaranteed false positive. Likewise `resultType`, `ttlMs` and
`cacheScope` are stamped by both official SDKs on every result once the negotiated revision
is `2026-07-28`, so a rule about them would only ever fire on hand-built JSON-RPC envelopes.
Likewise `resources/subscribe` and `resources/unsubscribe` of Major 4: they disappear into
`subscriptions/listen`, but a handler for them is dead code rather than a wire error, and
the 2.x SDK offers no drop-in replacement to point at. `fixtures/before` serves both, and
`verify` reports what the suite makes of them.

Run `mcp-migrate-delta rules` for the full text of each rule, including its remediation; `rules --json` gives the same as data.

## What migration means in TypeScript

There is no partial support of `2026-07-28` in the 1.x line. `@modelcontextprotocol/sdk@1.30.0`
contains no occurrence of `server/discover`, `Mcp-Method` or `resultType`. Migrating a
TypeScript server means switching to `@modelcontextprotocol/server` 2.x (and
`@modelcontextprotocol/node` for Node transports). The official codemod,
`npx @modelcontextprotocol/codemod@latest v1-to-v2 .`, rewrites the SDK surface; its own
README says the protocol adoption (`createMcpHandler`, multi round-trip requests, version
negotiation) is architectural and not codemod-automatable. The two fixtures in this
repository are a worked example of that architectural part, side by side.

A 2.x server still accepts a `2025-11-25` client with `initialize`: the SDK bridges eras.
This scanner is meant for 1.x code bases. On a 2.x code base that keeps serving legacy
clients, the findings describe what modern clients can no longer reach; they are true, and
they may be intentional.

## Scanning the SDK itself, as a measurement

A scan of `modelcontextprotocol/typescript-sdk` at commit `5119ee7f`, run on 05 September
2026, reports 680 breaking findings, spread over 129 of the 743 files it reads. That is
expected and is not a false positive rate: the SDK implements both eras, its server
dispatches `ping`, `logging/setLevel` and `initialize` for legacy clients, its client builds
`initialize`, and 539 of those 680 findings sit in its test files. An SDK must contain the
constructions a scanner looks for. The false positive oracle of this project is
`fixtures/after`, a server written on the 2.x SDK the modern way, on which the scanner is
silent.

## Ecosystem measurement

Measured on 06 September 2026, from the official registry, with the probe in
`src/ecosystem/` and the script `scripts/measure-ecosystem.mjs`. Raw results, the selection
file and the method are in `docs/ecosystem/`.

**Sample.** The registry (`/v0.1/servers?version=latest`) listed 27,410 servers that day,
15,465 with a remote endpoint. Filters: active, latest version, an `https` Streamable HTTP
remote without declared headers or template variables, no localhost or tunnel host, no
authentication word in the description, published more than seven days earlier. That leaves
10,027 candidates, and 6,023 once deduplicated to one server per namespace, host and URL.
Recency was rejected as a selection rule because the most recently updated entries were a
temporary tunnel and three servers of one publisher; the thirty are drawn from those 6,023,
ordered by the SHA-256 of the registry name. The rule is deterministic and replayable as the
corpus grows. An unreachable server is not replaced by a reserve entry: replacing it would
bias the sample towards live servers and erase a measured fact.

**Probe.** At most two POST requests per server: `server/discover` on the 2026-07-28 wire
(the three SEP-2243 headers and per-request `_meta`), then, only if that did not settle the
verdict, a 2025-11-25 `initialize` that is never followed by a `notifications/initialized`.
Never a `tools/call`, no credentials, no `Origin` header, no retry, not even on a 429, 15 s
timeout, 5 s pause between requests and between servers, an identifying User-Agent, bodies
read to 64 KiB at most and kept to 4 KiB. The pass sent 52 requests, 60 at most by
construction.

**Result, 30 servers.**

| Verdict | Servers | Meaning |
| --- | --- | --- |
| declares 2026-07-28 | 0 | `supportedVersions` or a `-32022` listing the revision |
| legacy | 19 | negotiates an earlier revision on `initialize`: 10 on `2025-11-25`, 5 on `2025-06-18`, 3 on `2024-11-05`, 1 on `2025-03-26` |
| auth-required | 7 | 401, or 403 with `WWW-Authenticate`; nothing else can be said |
| other | 3 | HTTP 404 with a JSON body on both requests; not an MCP endpoint at that URL that day |
| unreachable | 1 | no HTTP answer |

Of the 19 endpoints that could be read, none declared the current revision, forty days after
it shipped; the 7 behind authentication cannot be read and say nothing either way. A verdict
records what a server declares, not that it conforms: a server declaring `2026-07-28` would
still have to pass the suite. The response bodies are kept, truncated, in the JSON report so
every verdict can be checked by hand. A dated log of every run against servers that are not
this project's own fixtures is kept in `docs/USAGE-REEL.md`.

Registry data is published under CC0 and the registry's terms allow downstream processing;
this project is not affiliated with the registry or the Model Context Protocol project.
Server names and URLs are in `docs/ecosystem/2026-09-06.md`; no judgement on their authors is
implied. The probe's User-Agent names this repository, and any operator who wants an endpoint
left out of future runs can open an issue here.

## Exit codes

| Command | 0 | 1 | 2 |
| --- | --- | --- | --- |
| `scan` | no breaking finding | at least one breaking finding | usage error, unreadable path |
| `verify` | no scored scenario failed or crashed | at least one did | usage error, no HTTP server at the URL, unknown revision, unreadable baseline |
| `verify --baseline` | no regression | at least one check of a scored scenario regressed | as above, or the baseline is not a run report |

## JSON reports

Every report carries `reportVersion` (currently `1`) and `kind` (`scan`, `run` or `delta`).
A consumer that sees a higher version than it knows should refuse to parse rather than guess.
The shapes are the exported TypeScript types `ScanReport`, `RunReport` and `DeltaReport`
(`src/report.ts` in the repository, `dist/report.d.ts` in the package). The programmatic API mirrors the CLI:

```ts
import { runConformance, computeDelta, deltaExitCode } from 'mcp-migrate-delta';

const before = await runConformance({ url: 'http://localhost:3001/mcp', requirements: '2026-07-28' });
const after = await runConformance({ url: 'http://localhost:3002/mcp', requirements: '2026-07-28' });
const delta = computeDelta(before, after);
process.exitCode = deltaExitCode(delta);
```

## Scope, and what this tool does not do

- TypeScript and JavaScript only. Python servers already have `mcp-migrate` on PyPI.
- No `fix` command. The only safe mechanical rewrite in this migration is `-32002` to
  `-32602`; everything else is architectural, and the tool says so instead of pretending.
- No HTTP+SSE, no stdio: `verify` targets a Streamable HTTP endpoint, which is what the
  suite's `server` command tests.
- Four rules, not sixteen. The other entries of the changelog are either handled by the
  SDK once the package changes, or detectable only on hand-built envelopes.

## Development

```bash
npm ci
npm run typecheck
npm test            # offline: rules, results reader, delta engine, CLI on a stub suite
npm run test:network  # starts both fixtures and runs the real suite against them
```

`test/fixtures/conformance-results/` holds the raw `checks.json` output of two real runs,
so the delta engine is tested offline on real data.

## License

Apache-2.0. See `LICENSE` and `NOTICE`. The tool invokes the official conformance suite as a
dependency and quotes short passages of the specification in its remediation text; both are
published by the Model Context Protocol project under Apache-2.0 with earlier contributions
under MIT, and no source code from those repositories is copied here.
