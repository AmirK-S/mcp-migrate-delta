# Fixture: after (MCP revision 2026-07-28)

The migrated side of the conformance delta. Same domain surface as
`fixtures/before`, with the same tool, prompt and resource names wherever the
revision keeps them, rewritten for revision 2026-07-28 on
`@modelcontextprotocol/server` 2.x and `@modelcontextprotocol/node` 2.x. The
elicitation, sampling and roots tools of the before side become
`test_input_required_result_*` tools here, and the subscribed resource
disappears with `resources/subscribe`.

What the revision changed, and what this file therefore looks like:

- no `initialize` handshake and no `Mcp-Session-Id`: `createMcpHandler` serves
  each request on its own, from a fresh server built by one factory;
- no server-to-client requests. Elicitation, sampling and roots are returned as
  multi-round-trip results (`inputRequired(...)`), and the client fulfils them
  on retry with `inputResponses`;
- `ping`, `logging/setLevel`, `resources/subscribe` and `resources/unsubscribe`
  no longer exist; list-change traffic goes through `subscriptions/listen`,
  which the handler's own event bus serves;
- `resultType`, `ttlMs` and `cacheScope` are required on the wire. The SDK
  stamps all three; the `cacheHints` option only picks the values;
- `requestState` round-trips through the client, so it is signed with
  `createRequestStateCodec` and verified before any handler runs;
- `createMcpHandler` is deliberately validation-free, so the `Host` and
  `Origin` guards are composed explicitly in front of it.

## Run

```bash
node fixtures/after/src/server.mjs          # http://127.0.0.1:3002/mcp
PORT=4002 node fixtures/after/src/server.mjs
```

## What the suite gives

```bash
node node_modules/@modelcontextprotocol/conformance/dist/index.js \
  server --url http://localhost:3002/mcp --requirements 2026-07-28 -o /tmp/after
```

All 37 scored scenarios pass: **119 scored checks passed, 0 failed**.

The 13 scenarios the revision does not score still run. One passes
(`http-header-validation`); `tasks-status-notifications` is reported green with
no scored check at all, which `verify` labels `empty`; the other eleven fail
because this fixture does not implement the tasks extension (SEP-2663), the
JSON Schema 2020-12 probe tool, or `x-mcp-header` tool annotations. None of
that affects conformance.
