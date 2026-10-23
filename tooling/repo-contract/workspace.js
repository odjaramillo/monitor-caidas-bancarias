// Reads the packages of the pnpm workspace and the test files inside them.
// The reader knows only the globs that pnpm-workspace.yaml uses: `<dir>/*` and a plain `<dir>`.
// It reads a block list, quoted or not. Any other glob or list shape makes it throw.
// So a new shape cannot drop a package in silence.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const GLOB = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*(\/\*)?$/;
const LIST_ITEM = /^\s*- (.+)$/;

// Tests live in these files: `*.test.ts`, `*.test.js` and the browser tests `*.e2e.ts`.
const TEST_FILE = /\.(test|e2e)\.[jt]s$/;

// Build output, coverage and installed packages hold no source tests.
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage']);

function unquote(value) {
  return value.trim().replace(/^(['"])(.*)\1$/, '$2');
}

/** Returns the entries of the `packages:` list of pnpm-workspace.yaml. */
export function workspaceGlobs(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => /^packages:/.test(line));
  if (start < 0) return [];
  const inline = lines[start].replace(/^packages:/, '').trim();
  if (inline !== '') throw new Error(`Unsupported workspace packages: ${inline}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^\S/.test(line) && !LIST_ITEM.test(line));
  const globs = (end < 0 ? rest : rest.slice(0, end))
    .map((line) => LIST_ITEM.exec(line))
    .filter((match) => match !== null)
    .map((match) => unquote(match[1]));
  if (globs.length === 0) throw new Error('The workspace packages list has no entries');
  const unknown = globs.filter((glob) => !GLOB.test(glob));
  if (unknown.length > 0) throw new Error(`Unsupported workspace globs: ${unknown.join(', ')}`);
  return globs;
}

function isDir(path) {
  return existsSync(path) && statSync(path).isDirectory();
}

function globDirs(root, glob) {
  if (!glob.endsWith('/*')) return [glob];
  const parent = glob.slice(0, -2);
  if (!isDir(join(root, parent))) return [];
  return readdirSync(join(root, parent))
    .map((name) => `${parent}/${name}`)
    .filter((dir) => isDir(join(root, dir)));
}

/** Returns the directories of the workspace packages, relative to the root, in sorted order. */
export function workspacePackageDirs(root) {
  const globs = workspaceGlobs(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8'));
  return globs
    .flatMap((glob) => globDirs(root, glob))
    .filter((dir) => existsSync(join(root, dir, 'package.json')))
    .sort();
}

function walk(root, dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (!entry.isDirectory()) return TEST_FILE.test(entry.name) ? [path] : [];
    return SKIPPED_DIRS.has(entry.name) || entry.name.startsWith('.') ? [] : walk(root, path);
  });
}

/** Returns the test files of every workspace package, relative to the root, in sorted order. */
export function testFiles(root) {
  return workspacePackageDirs(root)
    .flatMap((dir) => walk(root, dir))
    .sort();
}
