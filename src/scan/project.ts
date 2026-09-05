import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { Project } from 'ts-morph';
import type { PackageManifest } from '../rules/types.js';

export interface ScanProject {
  project: Project;
  /** Absolute root every reported path is relative to. */
  root: string;
  manifests: PackageManifest[];
}

export const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.jsx']);
export const EXCLUDED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', '.git', '.next', '.turbo']);

function newProject(useInMemoryFileSystem: boolean): Project {
  return new Project({
    useInMemoryFileSystem,
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true, checkJs: false, noResolve: true },
  });
}

/** Builds a scan target from an in-memory tree. Paths are relative to a virtual root `/`. */
export function createProjectFromFiles(files: Record<string, string>): ScanProject {
  const project = newProject(true);
  const manifests: PackageManifest[] = [];
  for (const [path, text] of Object.entries(files)) {
    const normalised = path.replace(/^\/+/, '');
    if (normalised.split('/').some((segment) => EXCLUDED_DIRECTORIES.has(segment))) continue;
    if (basename(normalised) === 'package.json') {
      manifests.push({ relativePath: normalised, text, json: parseJson(text) });
    } else if (SOURCE_EXTENSIONS.has(extname(normalised)) && !normalised.endsWith('.d.ts')) {
      project.createSourceFile(`/${normalised}`, text);
    }
  }
  return { project, root: '/', manifests };
}

/**
 * Builds a scan target from a directory, or from a single file. Directories named in
 * EXCLUDED_DIRECTORIES are skipped at any depth; `.d.ts` files are ignored.
 */
export function createProjectFromDirectory(path: string): ScanProject {
  const absolute = resolve(path);
  const project = newProject(false);
  const manifests: PackageManifest[] = [];

  if (statSync(absolute).isFile()) {
    const root = dirname(absolute);
    if (basename(absolute) === 'package.json') {
      const text = readFileSync(absolute, 'utf8');
      manifests.push({ relativePath: 'package.json', text, json: parseJson(text) });
    } else {
      project.addSourceFileAtPath(absolute);
    }
    return { project, root, manifests };
  }

  for (const file of walk(absolute)) {
    const rel = relative(absolute, file).split(sep).join('/');
    if (basename(file) === 'package.json') {
      const text = readFileSync(file, 'utf8');
      manifests.push({ relativePath: rel, text, json: parseJson(text) });
    } else if (SOURCE_EXTENSIONS.has(extname(file)) && !file.endsWith('.d.ts')) {
      project.addSourceFileAtPath(file);
    }
  }
  return { project, root: absolute, manifests };
}

function* walk(dir: string): Generator<string> {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      yield* walk(join(dir, entry.name));
    } else if (entry.isFile()) {
      yield join(dir, entry.name);
    }
  }
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
