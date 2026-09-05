import { Node, SyntaxKind, type SourceFile } from 'ts-morph';
import { matchAt, type Rule, type RuleMatch } from './types.js';
import { identifierUsages, methodLiterals, stringLiteralsMatching } from './syntax.js';

const SCHEMA_IDENTIFIERS = new Set(['InitializeRequestSchema', 'InitializedNotificationSchema']);
const TRANSPORT_SUFFIX = 'StreamableHTTPServerTransport';
const SESSION_HEADER = /^mcp-session-id$/i;

/**
 * Revision 2026-07-28 removes protocol sessions (Major 1) and the initialize handshake
 * (Major 2). Anything that mints a session id, reads the `Mcp-Session-Id` header or handles
 * `initialize` is dead code on the new wire, and state keyed by session is lost.
 */
export const statefulHandshake: Rule = {
  id: 'stateful-handshake',
  severity: 'breaking',
  section: 'Major 1, Major 2',
  title: 'Stateful session and initialize handshake',
  description:
    'Revision 2026-07-28 removes protocol-level sessions, the Mcp-Session-Id header and the initialize/notifications/initialized handshake. Protocol version and client capabilities arrive in _meta on every request.',
  remediation:
    'Serve the handler from createMcpHandler (or serveStdio) of @modelcontextprotocol/server 2.x, which negotiates per request. Replace state keyed by session with explicit handles passed as tool arguments, or with requestState for multi round-trip requests. Delete initialize handlers and session header plumbing.',
  checkSource(file: SourceFile): RuleMatch[] {
    const matches: RuleMatch[] = [];

    for (const node of file.getDescendantsOfKind(SyntaxKind.NewExpression)) {
      if (!node.getExpression().getText().endsWith(TRANSPORT_SUFFIX)) continue;
      const options = node.getArguments()[0];
      if (!options || !Node.isObjectLiteralExpression(options)) continue;
      const prop = options.getProperty('sessionIdGenerator');
      if (prop) {
        matches.push(
          matchAt(prop, 'Transport mints a session id with sessionIdGenerator; 2026-07-28 has no protocol sessions.'),
        );
      }
    }

    for (const literal of stringLiteralsMatching(file, (text) => SESSION_HEADER.test(text))) {
      matches.push(matchAt(literal, 'Reads or writes the Mcp-Session-Id header, which 2026-07-28 removes.'));
    }

    for (const id of identifierUsages(file, SCHEMA_IDENTIFIERS)) {
      matches.push(matchAt(id, `Handles ${id.getText()}; the initialize handshake no longer exists in 2026-07-28.`));
    }

    for (const access of file.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
      if (access.getName() !== 'oninitialized') continue;
      matches.push(matchAt(access, 'Hooks oninitialized; the initialize handshake no longer exists in 2026-07-28.'));
    }

    for (const literal of methodLiterals(file, new Set(['initialize', 'notifications/initialized']))) {
      matches.push(matchAt(literal, `Builds or matches the ${literal.getLiteralText()} message, removed in 2026-07-28.`));
    }

    return matches;
  },
};
