---
name: mcp-migrate-delta
description: Measure what MCP revision 2026-07-28 breaks in a TypeScript MCP server, and prove a migration off @modelcontextprotocol/sdk 1.x with the official conformance suite run before and after. Use when a user migrates an MCP server to @modelcontextprotocol/server 2.x, asks whether a migration actually worked, needs a regression gate on an MCP migration, or has just run @modelcontextprotocol/codemod.
license: Apache-2.0
metadata:
  version: "0.2.2"
  pinned_conformance: "@modelcontextprotocol/conformance@0.2.0-alpha.11"
  pinned_revision: "2026-07-28"
  repository: https://github.com/AmirK-S/mcp-migrate-delta
---

# mcp-migrate-delta

This skill is the order of operations around a migration, not the migration itself. It tells
you when to measure and how to read the measurement. The rewriting is done by the official
codemod and guide, which stay the only source of truth for what changes in the code. Do not
copy their content here; link to them.

The tool runs with `npx mcp-migrate-delta` (Node 22 or later). Every command prints what it
does and what its exit code means; read that output rather than assuming.

## Procedure

### 1. See what will break, statically

```bash
npx mcp-migrate-delta scan <path-to-server-source>
```

Read the findings. They are grouped by file with a rule id and the changelog section of
revision 2026-07-28 they come from. `npx mcp-migrate-delta rules` prints each rule with its
remediation. A finding marked `fix (safe)` can be applied with `npx mcp-migrate-delta fix
<path>`; everything else is architectural and must be done by hand in step 3.

### 2. Take the baseline before changing anything

Start the server as it is today on its Streamable HTTP endpoint, then:

```bash
npx mcp-migrate-delta verify --url http://localhost:<port>/mcp --report before.json
```

This runs the official conformance suite, pinned, with `--requirements 2026-07-28`, and keeps
the result as `before.json`. Do this before the first edit: a baseline taken after the
rewrite proves nothing. Expect almost every scored scenario to fail on a 2025-11-25 server;
the "Root causes" block will say why in one line. That is the starting point, not a bug.

If the tool refuses to measure because nothing answers at the URL, the server is not running
or the URL is wrong; fix that first. Never treat that message as a measurement.

### 3. Migrate with the official tooling

Follow, in this order, without improvising:

1. The official codemod for the SDK surface:
   `npx @modelcontextprotocol/codemod@latest v1-to-v2 .`
   then `grep -rn '@mcp-codemod-error' .` for what it refused.
2. The official migration guide of the TypeScript SDK, `docs/migration/upgrade-to-v2.md`,
   which is itself written as an agent skill, and `docs/migration/support-2026-07-28.md`
   for the protocol adoption (`createMcpHandler`, multi round-trip requests, version
   negotiation), which the codemod README says is architectural and not automatable:
   https://github.com/modelcontextprotocol/typescript-sdk/tree/main/docs/migration
3. Re-run `scan` on the result. It should print `No finding`.

Do not invent mappings, import paths or error codes from memory; take them from the codemod
and the guide.

### 4. Prove it

Start the migrated server, then:

```bash
npx mcp-migrate-delta verify --url http://localhost:<port>/mcp --baseline before.json --report delta.json
```

Read the exit code the command prints and what the tool says it means. The delta lists each
regression by scenario and check. The error message of a failing check lives in a run report,
not in a delta report, so add a second pass without `--baseline` when you need it:
`npx mcp-migrate-delta verify --url http://localhost:<port>/mcp --report after.json`. Fix the
regression, restart the server, run this step again. Do not touch `before.json`.

### 5. Read the delta

The text output ends with a verdict line. Report to the user:

- the scored scenarios failing before and after,
- the number of checks fixed and regressed,
- the remaining failing scenarios, if any, with their root cause from the run report.

`references/interpreting.md` explains the cases that are not regressions but look like them,
and the ones that are hidden by a green suite.

## What this skill does not do

- It does not explain how to migrate. The codemod and the guide do.
- It does not decide what counts as a regression. The tool's exit code does; read it.
- It does not run the suite against servers that are not the user's own.
