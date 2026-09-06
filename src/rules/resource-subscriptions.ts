import { Node, SyntaxKind, type SourceFile } from 'ts-morph';
import { matchAt, type Rule, type RuleMatch } from './types.js';
import { identifierUsages, stringLiteralsMatching } from './syntax.js';

const SCHEMA_IDENTIFIERS = new Map<string, string>([
  ['SubscribeRequestSchema', 'resources/subscribe'],
  ['UnsubscribeRequestSchema', 'resources/unsubscribe'],
]);
const METHODS = new Set(['resources/subscribe', 'resources/unsubscribe']);

/**
 * Major 4 of 2026-07-28 replaces `resources/subscribe` and `resources/unsubscribe` (and the
 * HTTP GET stream they relied on) with `subscriptions/listen`, a single long-lived POST
 * response stream the client opts into. A handler for the old methods answers nothing on the
 * new wire, and the `resources.subscribe` capability flag no longer means anything.
 */
export const resourceSubscriptions: Rule = {
  id: 'resource-subscriptions',
  severity: 'breaking',
  section: 'Major 4',
  title: 'resources/subscribe and unsubscribe replaced by subscriptions/listen',
  description:
    'Revision 2026-07-28 removes resources/subscribe, resources/unsubscribe and the HTTP GET endpoint. Clients opt into change notifications through a single subscriptions/listen stream; the server acknowledges and tags notifications with io.modelcontextprotocol/subscriptionId.',
  remediation:
    'Drop the subscribe and unsubscribe handlers and the resources.subscribe capability flag from the modern path. In @modelcontextprotocol/server 2.x nothing is registered: createMcpHandler and serveStdio serve subscriptions/listen themselves, createMcpHandler returns a notify facade (handler.notify.resourceUpdated(uri), toolsChanged, promptsChanged, resourcesChanged) and clients opt in through the resourceSubscriptions field of the listen filter. A server that still answers 2025-era clients keeps the old handlers on purpose: the SDK leaves that path unchanged. There is no mechanical rewrite: what the old handlers stored per session has no equivalent.',
  checkSource(file: SourceFile): RuleMatch[] {
    const matches: RuleMatch[] = [];

    for (const id of identifierUsages(file, new Set(SCHEMA_IDENTIFIERS.keys()))) {
      const method = SCHEMA_IDENTIFIERS.get(id.getText())!;
      matches.push(matchAt(id, `Handles ${method} through ${id.getText()}; the method is replaced by subscriptions/listen in 2026-07-28.`));
    }

    for (const literal of stringLiteralsMatching(file, (text) => METHODS.has(text))) {
      matches.push(matchAt(literal, `Builds or matches the ${literal.getLiteralText()} message, replaced by subscriptions/listen in 2026-07-28.`));
    }

    // `resources: { subscribe: true }` inside a capabilities object literal.
    for (const prop of file.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
      if (prop.getName() !== 'subscribe') continue;
      const initializer = prop.getInitializer();
      if (!initializer || initializer.getKind() !== SyntaxKind.TrueKeyword) continue;
      const resources = prop.getParent().getParent();
      if (!Node.isPropertyAssignment(resources) || resources.getName() !== 'resources') continue;
      // Only inside a capabilities object: `resources: { subscribe: true }` is an ordinary
      // shape outside MCP, and a rule that fires on it is a false positive by construction.
      const capabilities = resources.getParent().getParent();
      if (!Node.isPropertyAssignment(capabilities) || capabilities.getName() !== 'capabilities') continue;
      matches.push(matchAt(prop, 'Advertises the resources.subscribe capability; 2026-07-28 negotiates subscriptions through subscriptions/listen instead.'));
    }

    return matches.sort((a, b) => a.line - b.line || a.column - b.column);
  },
};
