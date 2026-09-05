# Fixture: before (MCP revision 2025-11-25)

The starting point of the conformance delta: a good 2025-era Streamable HTTP
server on `@modelcontextprotocol/sdk` 1.x, express 5 and zod 4.

It is written the way that revision expects: a stateful transport with a
generated `Mcp-Session-Id`, a GET stream for server-initiated traffic, DELETE to
end the session, and server-to-client requests issued from inside tool handlers
(`elicitInput`, `createMessage`, `listRoots`). It also serves the four methods
revision 2026-07-28 deletes: `ping`, `logging/setLevel`, `resources/subscribe`
and `resources/unsubscribe`, the last two answering an unknown URI with the
`-32002` resource-not-found code this revision uses.

Everything in that paragraph is what the migration has to rewrite, which is why
this file carries it explicitly rather than leaning on SDK defaults.

## Run

```bash
node fixtures/before/src/server.mjs          # http://127.0.0.1:3001/mcp
PORT=4001 node fixtures/before/src/server.mjs
```

## What the suite gives

```bash
node node_modules/@modelcontextprotocol/conformance/dist/index.js \
  server --url http://localhost:3001/mcp --requirements 2025-11-25 -o /tmp/before-2025
node node_modules/@modelcontextprotocol/conformance/dist/index.js \
  server --url http://localhost:3001/mcp --requirements 2026-07-28 -o /tmp/before-2026
```

Under **2025-11-25**: all 30 scored scenarios pass, **70 scored checks passed,
0 failed**. The two failures reported are `json-schema-2020-12` and
`server-sse-polling`, both marked `pending` and never scored.

Under **2026-07-28**: **11 scored checks passed, 95 failed**, across 36 of the
37 scored scenarios. That is the delta the migration closes, and it is expected.
