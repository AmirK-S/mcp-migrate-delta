import { describe, expect, it } from 'vitest';
import {
  conformancePackageVersion,
  loadRequirements,
  parseRequirements,
  requirementsFilePath,
} from '../../src/verify/requirements.js';

describe('requirements file shipped by @modelcontextprotocol/conformance', () => {
  it('resolves the pinned package version', () => {
    expect(conformancePackageVersion()).toBe('0.2.0-alpha.11');
  });

  it('finds requirements/2026-07-28.yaml inside the installed package', () => {
    expect(requirementsFilePath('2026-07-28')).toMatch(/requirements[\\/]2026-07-28\.yaml$/);
  });

  it('lists 37 scored and 13 not scored server scenarios for 2026-07-28', () => {
    const req = loadRequirements('2026-07-28');
    expect(req.revision).toBe('2026-07-28');
    expect(req.server.scored).toHaveLength(37);
    expect(req.server.scored[0]).toBe('server-stateless');
    expect(req.server.notScored).toHaveLength(13);
    expect(req.server.notScored.map((s) => s.id)).toContain('tasks-capability-negotiation');
    expect(req.server.notScored.find((s) => s.id === 'json-schema-2020-12')?.reason).toBe('pending');
    expect(req.server.notScored.find((s) => s.id === 'tasks-lifecycle')?.reason).toBe('extension');
  });

  it('lists 30 scored and 3 not scored server scenarios for 2025-11-25', () => {
    const req = loadRequirements('2025-11-25');
    expect(req.server.scored).toHaveLength(30);
    expect(req.server.notScored).toHaveLength(3);
  });

  it('refuses a revision the package does not ship', () => {
    expect(() => loadRequirements('2030-01-01')).toThrow(/2030-01-01/);
  });

  it('keeps only the server leg from a raw document', () => {
    const req = parseRequirements(
      '2026-07-28',
      [
        'server:',
        '  - a',
        '  - b',
        'client:',
        '  - c',
        'not_scored:',
        '  - scenario: d',
        '    leg: server',
        '    reason: pending',
        '  - scenario: e',
        '    leg: client',
        '    reason: extension',
      ].join('\n'),
    );
    expect(req.server.scored).toEqual(['a', 'b']);
    expect(req.server.notScored).toEqual([{ id: 'd', reason: 'pending' }]);
    expect(req.server.all).toEqual(['a', 'b', 'd']);
  });
});
