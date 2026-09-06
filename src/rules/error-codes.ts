import type { SourceFile } from 'ts-morph';
import { matchAt, type Rule, type RuleMatch } from './types.js';
import { negativeNumericLiterals } from './syntax.js';

const RESOURCE_NOT_FOUND_OLD = 32002;
const RESOURCE_NOT_FOUND_NEW = '-32602';
const URL_ELICITATION_REQUIRED = 32042;

/**
 * Minor 6 of 2026-07-28 moves resource not found from -32002 to -32602 (Invalid Params).
 * The -32001 to -32004 renumbering of Minor 12 concerns codes introduced in the 2026-07-28
 * draft itself and never existed in 2025-11-25, so it is deliberately not a rule: in 1.x
 * code -32001 is the SDK's own RequestTimeout, and -32000 to -32019 stay
 * implementation-defined. The only other 2025-11-25 code, -32042 (URL elicitation
 * required), is retired with the multi round-trip pattern and has no mechanical rewrite.
 */
export const errorCodes: Rule = {
  id: 'error-codes',
  severity: 'breaking',
  section: 'Minor 6',
  title: 'Resource not found error code changed from -32002 to -32602',
  description:
    'Revision 2026-07-28 changes the resource not found error code from -32002 to -32602 to align with JSON-RPC Invalid Params. The conformance scenario sep-2164-resource-not-found checks the new code.',
  remediation:
    'Replace -32002 with -32602. In @modelcontextprotocol/server 2.x, throw ResourceNotFoundError, which carries -32602 and echoes the requested uri in data; the ProtocolErrorCode.ResourceNotFound member is still -32002 and is receive-tolerated only, never emitted.',
  checkSource(file: SourceFile): RuleMatch[] {
    const matches: RuleMatch[] = [];
    for (const expr of negativeNumericLiterals(file, RESOURCE_NOT_FOUND_OLD)) {
      matches.push(
        matchAt(expr, 'Uses -32002 for resource not found; 2026-07-28 expects -32602.', {
          fix: { confidence: 'safe', replacement: RESOURCE_NOT_FOUND_NEW, original: expr.getText() },
        }),
      );
    }
    for (const expr of negativeNumericLiterals(file, URL_ELICITATION_REQUIRED)) {
      matches.push(
        matchAt(expr, 'Uses -32042 (URL elicitation required), a 2025-11-25 only code retired by 2026-07-28.', {
          severity: 'advisory',
          remediation:
            'Under the multi round-trip pattern the server returns an InputRequiredResult (resultType "input_required") carrying the elicitation in inputRequests instead of raising an error; the client retries the original request with inputResponses.',
          fix: null,
        }),
      );
    }
    return matches;
  },
};
