import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function readOwnVersion(): string {
  // Works from both src/ (tsx, vitest) and dist/ (published build): package.json is one level up.
  const here = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as { version: string };
  return pkg.version;
}

export const TOOL_VERSION: string = readOwnVersion();
