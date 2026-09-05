#!/usr/bin/env node
// Stand-in for the conformance binary, used by offline tests of the runner.
// Mimics the observed behaviour of @modelcontextprotocol/conformance 0.2.0-alpha.11:
// writes <out>/server-<scenario>-<timestamp>/checks.json only when -o is given,
// prints a human summary, exits 1 when a scored scenario has a FAILURE.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

if (args[0] !== 'server') {
  console.error(`stub: unexpected subcommand ${args[0]}`);
  process.exit(2);
}

const url = opt('--url');
const requirements = opt('--requirements');
const out = opt('-o') ?? opt('--output-dir');
const plan = JSON.parse(process.env.STUB_PLAN ?? '{}');

console.log(`stub: url=${url} requirements=${requirements}`);

if (plan.hang) {
  setInterval(() => {}, 1000);
} else {
  let failed = 0;
  for (const [scenario, checks] of Object.entries(plan.scenarios ?? {})) {
    if (out) {
      const dir = join(out, `server-${scenario}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'checks.json'), JSON.stringify(checks));
    }
    const f = checks.filter((c) => c.status === 'FAILURE').length;
    failed += f;
    console.log(`${f ? '✗' : '✓'} ${scenario}: ${checks.length - f} passed, ${f} failed`);
  }
  console.error('stub: some noise on stderr');
  process.exit(failed > 0 ? 1 : 0);
}
