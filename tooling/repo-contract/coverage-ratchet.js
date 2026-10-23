// Ratchets the coverage floors (issue #120).
// Vitest fails when coverage falls below a floor. This script fails when coverage rises above a
// floor by more than TOLERANCE, so the PR that raises coverage also raises the floor.
// No workflow writes the floors: the author runs `pnpm coverage:ratchet` and commits the configs.
//
// Usage: node tooling/repo-contract/coverage-ratchet.js [--write] [--root <dir>]
// It reads <project>/coverage/coverage-summary.json, the json-summary report of the last `pnpm test`.
// Without --write it checks the floors. With --write it raises them to the measured coverage.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECTS = [
  { dir: 'apps/api', config: 'apps/api/vitest.config.ts' },
  { dir: 'apps/web', config: 'apps/web/vite.config.ts' }
];

export const METRICS = ['statements', 'branches', 'functions', 'lines'];

// Premise (measured 2026-10-22): main runs 39879649622, 39880119085, 39883183277, 39883489024
// and 39883754785 gave the same totals on the same code, so coverage has no jitter in CI.
// 0.1 points only absorbs rounding: one statement of the API is 0.48 points, one of the frontend
// 0.79. Re-evaluate when a project passes 1000 statements, where one statement is 0.1 points.
export const TOLERANCE = 0.1;

const THRESHOLDS = /^( *)thresholds: \{\n([\s\S]*?)\n\1\}/m;
const FLOOR_COMMENT = /^( *)\/\/ Floor = coverage measured on (\d{4}-\d{2}-\d{2})\b.*$/;
const FLOOR_LINE = /^(\s*)([a-z]+): ([^,\s]+)(,?)$/;

// Finds the thresholds block and the dated comment above it. Throws when either is missing.
function locate(text) {
  const block = THRESHOLDS.exec(text);
  if (!block) throw new Error('The config has no thresholds block.');
  const lines = text.slice(0, block.index).split('\n');
  // lines ends with the empty text before `thresholds`; the comments sit above it.
  const comments = lines.slice(0, -1).reverse();
  const end = comments.findIndex((line) => !line.trim().startsWith('//'));
  const above = end < 0 ? comments : comments.slice(0, end);
  const commentIndex = above.findIndex((line) => FLOOR_COMMENT.test(line));
  if (commentIndex < 0) {
    throw new Error(
      'The thresholds have no dated comment "// Floor = coverage measured on <date>".'
    );
  }
  return { block, commentLine: lines.length - 2 - commentIndex };
}

/** Returns the date of the measurement and the four floors of a Vitest config. */
export function readFloors(text) {
  const { block, commentLine } = locate(text);
  const date = FLOOR_COMMENT.exec(text.split('\n')[commentLine])[2];
  const values = Object.fromEntries(
    block[2]
      .split('\n')
      .map((line) => FLOOR_LINE.exec(line))
      .filter((match) => match !== null)
      .map((match) => [match[2], Number(match[3])])
  );
  const floors = {};
  for (const metric of METRICS) {
    if (!Number.isFinite(values[metric]))
      throw new Error(`The thresholds have no number for ${metric}.`);
    floors[metric] = values[metric];
  }
  return { date, floors };
}

/** Returns the config with the new floors and a comment with the date of their measurement. */
export function writeFloors(text, floors, date) {
  const { block, commentLine } = locate(text);
  const body = block[2]
    .split('\n')
    .map((line) => {
      const match = FLOOR_LINE.exec(line);
      if (!match || !METRICS.includes(match[2])) return line;
      return `${match[1]}${match[2]}: ${floors[match[2]]}${match[4]}`;
    })
    .join('\n');
  const updated =
    text.slice(0, block.index) +
    block[0].replace(block[2], body) +
    text.slice(block.index + block[0].length);
  const lines = updated.split('\n');
  const indent = FLOOR_COMMENT.exec(lines[commentLine])[1];
  lines[commentLine] =
    `${indent}// Floor = coverage measured on ${date} by pnpm coverage:ratchet (decision D16).`;
  return lines.join('\n');
}

/** Returns one error for each metric above its floor by more than the tolerance. */
export function ratchetErrors(project, floors, summary, tolerance = TOLERANCE) {
  return METRICS.flatMap((metric) => {
    const pct = summary.total?.[metric]?.pct;
    if (typeof pct !== 'number')
      return [`${project}: coverage-summary.json has no number for ${metric}.`];
    if (pct - floors[metric] <= tolerance + 1e-9) return [];
    return [
      `${project}: ${metric} coverage ${pct}% is above its floor ${floors[metric]}% by more than ${tolerance}. Run pnpm coverage:ratchet and commit the new floor.`
    ];
  });
}

function readSummary(root, dir) {
  const path = `${dir}/coverage/coverage-summary.json`;
  if (!existsSync(join(root, path))) throw new Error(`${path} is missing. Run pnpm test first.`);
  return JSON.parse(readFileSync(join(root, path), 'utf8'));
}

// Raises each floor to the measured coverage. A floor never goes down.
function raised(floors, summary) {
  return Object.fromEntries(
    METRICS.map((metric) => [metric, Math.max(floors[metric], summary.total[metric].pct)])
  );
}

function checkProject(root, { dir, config }, write, today) {
  const text = readFileSync(join(root, config), 'utf8');
  const { floors } = readFloors(text);
  const summary = readSummary(root, dir);
  const errors = ratchetErrors(dir, floors, summary);
  if (!write || errors.some((error) => error.includes('has no number'))) return { errors };
  const next = raised(floors, summary);
  if (METRICS.every((metric) => next[metric] === floors[metric])) return { errors: [] };
  writeFileSync(join(root, config), writeFloors(text, next, today));
  return { errors: [], changed: config };
}

function localDate() {
  // sv-SE writes the local date as YYYY-MM-DD.
  return new Date().toLocaleDateString('sv-SE');
}

/** Checks, or with `write` raises, the floor of every project. Fails closed on a missing input. */
export function run({ root, write = false, today = localDate() }) {
  const errors = [];
  const changed = [];
  for (const project of PROJECTS) {
    try {
      const result = checkProject(root, project, write, today);
      errors.push(...result.errors);
      if (result.changed) changed.push(result.changed);
    } catch (error) {
      errors.push(`${project.dir}: ${error.message}`);
    }
  }
  return { errors, changed };
}

function main(argv) {
  const rootIndex = argv.indexOf('--root');
  const root =
    rootIndex >= 0 ? argv[rootIndex + 1] : fileURLToPath(new URL('../../', import.meta.url));
  const write = argv.includes('--write');
  const { errors, changed } = run({ root, write });
  for (const error of errors) console.error(error);
  for (const config of changed) console.log(`Raised the coverage floor in ${config}.`);
  if (errors.length > 0) process.exit(1);
  if (!write) console.log(`No coverage rose above its floor by more than ${TOLERANCE} points.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
