import { Node, SyntaxKind, type SourceFile } from 'ts-morph';
import { matchAt, type Rule, type RuleMatch } from './types.js';
import { identifierUsages, methodLiterals, stringLiteralsMatching } from './syntax.js';

const SCHEMA_IDENTIFIERS = new Map<string, string>([
  ['SetLevelRequestSchema', 'logging/setLevel'],
  ['PingRequestSchema', 'ping'],
  ['RootsListChangedNotificationSchema', 'notifications/roots/list_changed'],
]);
const DISTINCTIVE_METHODS = new Set(['logging/setLevel', 'notifications/roots/list_changed']);
const GENERIC_METHODS = new Set(['ping']);
const MCP_RECEIVER = /server|client|mcp|protocol/i;

/**
 * Revision 2026-07-28 removes `ping`, `logging/setLevel` and `notifications/roots/list_changed`
 * (Major 5). Handlers for them are dead, callers get -32601, and the log level now travels per
 * request in `_meta`.
 */
export const removedMethods: Rule = {
  id: 'removed-methods',
  severity: 'breaking',
  section: 'Major 5',
  title: 'ping, logging/setLevel and notifications/roots/list_changed removed',
  description:
    'Revision 2026-07-28 removes ping, logging/setLevel and notifications/roots/list_changed. A 2026-07-28 server answers them with -32601; the log level is set per request via io.modelcontextprotocol/logLevel in _meta.',
  remediation:
    'Delete the handler or the call. For logging, read the io.modelcontextprotocol/logLevel _meta key of each request (ctx.mcpReq.log in @modelcontextprotocol/server does it for you) and stop emitting notifications/message for requests that did not set it. For liveness, use the transport (an HTTP request) rather than a protocol ping. Roots are obtained through a multi round-trip request, never pushed.',
  checkSource(file: SourceFile): RuleMatch[] {
    const matches: RuleMatch[] = [];

    for (const id of identifierUsages(file, new Set(SCHEMA_IDENTIFIERS.keys()))) {
      const method = SCHEMA_IDENTIFIERS.get(id.getText())!;
      matches.push(matchAt(id, `Handles ${method} through ${id.getText()}; the method is removed in 2026-07-28.`));
    }

    for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression();
      if (!Node.isPropertyAccessExpression(callee) || callee.getName() !== 'ping') continue;
      if (call.getArguments().length !== 0) continue;
      if (!MCP_RECEIVER.test(callee.getExpression().getText())) continue;
      matches.push(matchAt(call, 'Sends a protocol ping; the method is removed in 2026-07-28.'));
    }

    for (const literal of stringLiteralsMatching(file, (text) => DISTINCTIVE_METHODS.has(text))) {
      matches.push(matchAt(literal, `Builds or matches the ${literal.getLiteralText()} message, removed in 2026-07-28.`));
    }
    for (const literal of methodLiterals(file, GENERIC_METHODS)) {
      matches.push(matchAt(literal, `Builds or matches the ${literal.getLiteralText()} message, removed in 2026-07-28.`));
    }

    return matches;
  },
};
