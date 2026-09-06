# Changelog

All notable changes to this project are documented here. The format follows
Keep a Changelog, and the project follows Semantic Versioning.

## [Unreleased]

### Added

- Ecosystem probe (`src/ecosystem/`) and `scripts/measure-ecosystem.mjs`: classifies a
  public server as modern, legacy, auth-required, unreachable or other with at most two
  POST requests (`server/discover` for 2026-07-28, then `initialize` for 2025-11-25),
  never a `tools/call`, no retry, identifying User-Agent.
- `probeUrl` falls back to a `server/discover` POST when a server drops GET connections.

## [0.1.0] - 2026-09-05

### Added

- `scan`: static analysis of a TypeScript or JavaScript MCP server written for
  revision 2025-11-25, with four rules mapped to the 2026-07-28 changelog:
  `sdk-v1-package` (Major 2), `stateful-handshake` (Major 1 and 2),
  `removed-methods` (Major 5) and `error-codes` (Minor 6). Text and JSON
  reports, exit 1 on any breaking finding.
- `verify`: runs `@modelcontextprotocol/conformance` 0.2.0-alpha.11, pinned,
  with `--requirements` and `-o`, against a live server; reports scored and not
  scored scenarios, scenarios the suite crashed on without writing a result,
  scenarios reported green with zero checks, and failures grouped by root
  cause. With `--baseline`, prints the check-level delta between two runs and
  exits 1 on any regression of a scored scenario.
- `rules`: lists the rules.
- Two reference servers with the same surface, `fixtures/before` on
  `@modelcontextprotocol/sdk` 1.30.0 and `fixtures/after` on
  `@modelcontextprotocol/server` 2.0.0, used as the oracle of both commands.

[Unreleased]: https://github.com/AmirK-S/mcp-migrate-delta/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/AmirK-S/mcp-migrate-delta/releases/tag/v0.1.0
