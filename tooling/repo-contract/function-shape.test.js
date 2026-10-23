// Pins the function-shape measurement and its caps (issue #120).
// The caps in eslint.config.js come from this measurement. So the measurement must count
// exactly what the caps count, on exactly the files that the caps cover.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import {
  MEASURE_OPTIONS,
  measureText,
  percentile,
  productionFiles,
  summarize
} from './function-shape.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const eslint = new ESLint({ cwd: root });

const SHAPE_RULES = Object.keys(MEASURE_OPTIONS);

// Functions that were above a cap before #120. Each one carries a disable comment with its
// tracking issue. Keep this list equal to those comments. It only shrinks: a new entry needs
// a reason in its PR (ratchet rule of the QA standard).
const SHAPE_BASELINE = [
  'apps/api/src/demo-seed.ts: max-lines-per-function',
  'apps/api/src/status-worker.ts: max-lines-per-function',
  'apps/api/src/status-worker.ts: max-lines-per-function'
];

const SHAPE_DISABLE = new RegExp(
  `eslint-disable(?:-next-line|-line)?\\s+(${SHAPE_RULES.join('|')})\\b(.*)$`
);
const TRACKED = /^ -- .+ Tracking issue: #\d+\.$/;

// Returns every disable comment of a shape rule in production code, with the text after the rule.
function shapeDisables() {
  return productionFiles(root).flatMap((file) =>
    readFileSync(join(root, file), 'utf8')
      .split('\n')
      .map((line) => SHAPE_DISABLE.exec(line))
      .filter((match) => match !== null)
      .map((match) => ({ site: `${file}: ${match[1]}`, reason: match[2] }))
  );
}

// Returns the options of each shape rule for one file, or null when the rule is off.
async function capsOf(path) {
  const config = await eslint.calculateConfigForFile(join(root, path));
  return Object.fromEntries(
    SHAPE_RULES.map((rule) => {
      const [severity, options] = config.rules?.[rule] ?? [0];
      return [rule, severity === 0 || severity === 'off' ? null : options];
    })
  );
}

describe('function shape measurement', () => {
  it('takes the nearest-rank percentile', () => {
    const values = Array.from({ length: 20 }, (_, i) => 20 - i);
    expect(percentile(values, 95)).toBe(19);
    expect(percentile([7], 95)).toBe(7);
    expect(() => percentile([], 95)).toThrow('no values');
  });

  it('measures the parameters, nesting depth and lines of each function', async () => {
    const code = [
      'export function outer(a: number, b: number, c: number) {',
      '  // A comment line does not count.',
      '',
      '  if (a > b) {',
      '    for (const x of [c]) {',
      '      if (x) return x;',
      '    }',
      '  }',
      '  const inner = (y: number) => y;',
      '  return inner(a);',
      '}',
      ''
    ].join('\n');
    const file = 'apps/api/src/shape-fixture.ts';
    expect(await measureText(code, file)).toEqual([
      { file, line: 1, name: "Function 'outer'", params: 3, depth: 3, lines: 9 },
      { file, line: 9, name: 'Arrow function', params: 1, depth: 0, lines: 1 }
    ]);
  });

  it('measures the script and the template handlers of a Svelte component', async () => {
    const code = [
      '<script lang="ts">',
      '  function pick(a: string, b: string) {',
      '    return a || b;',
      '  }',
      '</script>',
      '',
      "<button onclick={() => pick('x', 'y')}>x</button>",
      ''
    ].join('\n');
    const file = 'apps/web/src/lib/ShapeFixture.svelte';
    const functions = await measureText(code, file);
    expect(
      functions.map(({ line, params, depth, lines }) => ({ line, params, depth, lines }))
    ).toEqual([
      { line: 2, params: 2, depth: 0, lines: 3 },
      { line: 7, params: 0, depth: 0, lines: 1 }
    ]);
  });

  it('gives the p95 and the maximum of each metric', () => {
    const functions = Array.from({ length: 20 }, (_, i) => ({
      params: i % 4,
      depth: i === 19 ? 5 : 1,
      lines: i + 1
    }));
    expect(summarize(functions)).toEqual({
      functions: 20,
      params: { p95: 3, max: 3 },
      depth: { p95: 1, max: 5 },
      lines: { p95: 19, max: 20 }
    });
  });

  it('measures only production code: no tests, no test helpers', () => {
    const files = productionFiles(root);
    expect(files).toContain('apps/api/src/levels.ts');
    expect(files).toContain('apps/web/src/routes/+page.svelte');
    expect(files.filter((file) => /\.test\.ts$|\/src\/testing\//.test(file))).toEqual([]);
  });
});

describe('function shape caps in eslint.config.js', () => {
  it('cap every production file with the options that the measurement uses', async () => {
    const files = productionFiles(root);
    const mismatched = [];
    for (const file of files) {
      const caps = await capsOf(file);
      for (const rule of SHAPE_RULES) {
        const options = caps[rule];
        const same =
          options &&
          JSON.stringify({ ...options, max: 0 }) === JSON.stringify(MEASURE_OPTIONS[rule]);
        if (!same) mismatched.push(`${file}: ${rule}`);
      }
    }
    expect(mismatched).toEqual([]);
  });

  it.each([
    'apps/api/src/levels.test.ts',
    'apps/api/src/testing/database.ts',
    'tooling/repo-contract/workflows.js'
  ])('leave %s outside the caps', async (path) => {
    expect(Object.values(await capsOf(path))).toEqual([null, null, null]);
  });
});

describe('old functions above a cap', () => {
  it('match the pinned baseline', () => {
    expect(shapeDisables().map(({ site }) => site)).toEqual(SHAPE_BASELINE);
  });

  it('each name their tracking issue', () => {
    expect(shapeDisables().filter(({ reason }) => !TRACKED.test(reason))).toEqual([]);
  });
});
