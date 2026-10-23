// Measures the shape of every production function (issue #120): parameters, nesting depth and lines.
// It runs the core ESLint rules max-params, max-depth and max-lines-per-function with a cap of 0,
// and records the count that each rule reports. So it counts exactly what the caps in
// eslint.config.js count, with the parsers of that config (TypeScript and Svelte).
//
// Usage: node tooling/repo-contract/function-shape.js
// It prints JSON: the date, the commit, the p95 and the maximum of each metric, and the largest functions.

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { builtinRules } from 'eslint/use-at-your-own-risk';

const root = fileURLToPath(new URL('../../', import.meta.url));

// The caps in eslint.config.js use these options with their own `max`.
// function-shape.test.js fails when the two disagree.
export const MEASURE_OPTIONS = {
  'max-params': { max: 0 },
  'max-depth': { max: 0 },
  'max-lines-per-function': { max: 0, skipBlankLines: true, skipComments: true, IIFEs: true }
};

// The value that each rule reports in the data of its message.
const METRICS = {
  'max-params': { metric: 'params', key: 'count' },
  'max-depth': { metric: 'depth', key: 'depth' },
  'max-lines-per-function': { metric: 'lines', key: 'lineCount' }
};

const FUNCTION_TYPES = ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'];

// max-depth starts a new count in a static block, so a static block also ends the search.
const DEPTH_SCOPES = new Set([...FUNCTION_TYPES, 'StaticBlock']);

// Production code is the source of each app, without its tests and test helpers.
const SOURCE = /\.(ts|svelte)$/;
const TEST = /\.test\.ts$/;
const TEST_HELPERS = 'testing';

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === TEST_HELPERS ? [] : walk(path);
    return SOURCE.test(entry.name) && !TEST.test(entry.name) ? [path] : [];
  });
}

/** Returns the production files of `apps/*\/src`, relative to the root, in sorted order. */
export function productionFiles(base) {
  const apps = join(base, 'apps');
  return readdirSync(apps, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => walk(join(apps, entry.name, 'src')))
    .map((path) => relative(base, path))
    .sort();
}

// Wraps a core rule. The wrapper keeps the reports of the rule and shows none to ESLint.
function recorder(ruleName, records) {
  const rule = builtinRules.get(ruleName);
  return {
    meta: rule.meta,
    create(context) {
      const report = (descriptor) => records.push({ rule: ruleName, ...descriptor });
      return rule.create(Object.create(context, { report: { value: report } }));
    }
  };
}

function createPlugin(functions, records) {
  const rules = Object.fromEntries(
    Object.keys(MEASURE_OPTIONS).map((name) => [name, recorder(name, records)])
  );
  rules.functions = {
    meta: { schema: [] },
    create(context) {
      const listener = (node) => functions.push({ file: context.filename, node });
      return Object.fromEntries(FUNCTION_TYPES.map((type) => [type, listener]));
    }
  };
  return { rules };
}

function enclosingScope(node) {
  let current = node.parent;
  while (current && !DEPTH_SCOPES.has(current.type)) current = current.parent;
  return current;
}

// Keeps the largest value of each metric for each function node.
function metricsByNode(records) {
  const byNode = new Map();
  for (const record of records) {
    const { metric, key } = METRICS[record.rule];
    const node = metric === 'depth' ? enclosingScope(record.node) : record.node;
    if (!node) continue;
    const entry = byNode.get(node) ?? {};
    entry[metric] = Math.max(entry[metric] ?? 0, record.data[key]);
    if (record.data.name) entry.name = record.data.name;
    byNode.set(node, entry);
  }
  return byNode;
}

function createLinter(functions, records) {
  const rules = { 'shape/functions': 'error' };
  for (const [name, options] of Object.entries(MEASURE_OPTIONS)) {
    rules[`shape/${name}`] = ['error', options];
  }
  return new ESLint({
    cwd: root,
    overrideConfig: { plugins: { shape: createPlugin(functions, records) }, rules }
  });
}

function toRows(functions, records) {
  const byNode = metricsByNode(records);
  return functions.map(({ file, node }) => {
    const metrics = byNode.get(node) ?? {};
    return {
      file: relative(root, file),
      line: node.loc.start.line,
      name: metrics.name ?? 'Function',
      params: metrics.params ?? 0,
      depth: metrics.depth ?? 0,
      lines: metrics.lines ?? null
    };
  });
}

/** Measures every function of one source text. `path` is relative to the root and picks the config. */
export async function measureText(code, path) {
  const functions = [];
  const records = [];
  await createLinter(functions, records).lintText(code, { filePath: join(root, path) });
  return toRows(functions, records);
}

/** Measures every function of the files, given relative to the root. */
export async function measureFiles(paths) {
  const functions = [];
  const records = [];
  await createLinter(functions, records).lintFiles(paths.map((path) => join(root, path)));
  return toRows(functions, records);
}

/** Returns the nearest-rank percentile: the smallest value with `p` percent of the values at or below it. */
export function percentile(values, p) {
  if (values.length === 0) throw new Error('percentile of no values');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil((p / 100) * sorted.length) - 1];
}

/** Returns the number of functions, and the p95 and the maximum of each metric. */
export function summarize(rows) {
  const stats = (metric) => {
    const values = rows.map((row) => row[metric]).filter((value) => value !== null);
    return { p95: percentile(values, 95), max: Math.max(...values) };
  };
  return {
    functions: rows.length,
    params: stats('params'),
    depth: stats('depth'),
    lines: stats('lines')
  };
}

function largest(rows, metric) {
  return [...rows]
    .sort((a, b) => b[metric] - a[metric])
    .slice(0, 5)
    .map((row) => `${row[metric]} ${row.file}:${row.line} ${row.name}`);
}

async function main() {
  const files = productionFiles(root);
  const rows = await measureFiles(files);
  const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: root,
    encoding: 'utf8'
  });
  const report = {
    date: new Date().toLocaleDateString('sv-SE'), // the local date, as YYYY-MM-DD
    commit: commit.trim(),
    files: files.length,
    ...summarize(rows),
    largest: Object.fromEntries(['params', 'depth', 'lines'].map((m) => [m, largest(rows, m)]))
  };
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
