// Pins the hygiene of the tests (issue #118).
// A focused test hides the rest of its file, and a skipped or pending test leaves the count in silence.
// A fixed wait makes the suite slow and flaky. A package without a `test` script drops out of `pnpm -r test`.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { afterEach, describe, expect, it } from 'vitest';
import { skipViolations } from './test-hygiene.js';
import { testFiles, workspaceGlobs, workspacePackageDirs } from './workspace.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const eslint = new ESLint({ cwd: root });

// One path per kind of test file in the repository. Each kind must exist and be linted.
const TEST_KINDS = [
  { kind: 'unit test of an app', pattern: /^apps\/[^/]+\/src\/.+\.test\.ts$/ },
  { kind: 'browser test', pattern: /^apps\/web\/e2e\/[^/]+\.e2e\.ts$/ },
  { kind: 'test of the tooling', pattern: /^tooling\/.+\.test\.js$/ }
];

const LINTED_PATHS = [
  'apps/web/src/lib/example.test.ts',
  'apps/web/e2e/example.e2e.ts',
  'tooling/repo-contract/example.test.js'
];

async function hygieneErrors(code, path) {
  const [result] = await eslint.lintText(code, { filePath: join(root, path) });
  return result.messages
    .filter((message) => message.ruleId === 'no-restricted-syntax')
    .map((message) => message.message);
}

// Builds one test call. The template keeps the skip pattern out of this file's own source.
function call(mode, tag = '') {
  return `it.${mode}('runs', () => {});${tag ? ` ${tag}` : ''}`;
}

const NOW = new Date('2026-10-22T12:00:00Z');

describe('ESLint rules for test files', () => {
  const rejected = [
    { code: "it.only('a', () => {});", error: 'A focused test hides the other tests' },
    { code: "describe.only('a', () => {});", error: 'A focused test hides the other tests' },
    { code: "test.describe.only('a', () => {});", error: 'A focused test hides the other tests' },
    { code: "it.todo('a');", error: 'A pending test' },
    {
      code: 'await new Promise((resolve) => setTimeout(resolve, 100));',
      error: 'A fixed wait makes the tests slow and flaky'
    },
    {
      code: 'await page.waitForTimeout(500);',
      error: 'A fixed wait makes the tests slow and flaky'
    },
    {
      code: "import { setTimeout } from 'node:timers/promises';",
      error: 'A fixed wait makes the tests slow and flaky'
    },
    { code: 'await sleep(100);', error: 'A fixed wait makes the tests slow and flaky' }
  ];

  const cases = LINTED_PATHS.flatMap((path) => rejected.map((item) => ({ path, ...item })));

  it.each(cases)('rejects $code in $path', async ({ code, path, error }) => {
    const errors = await hygieneErrors(`${code}\nexport {};\n`, path);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(error);
  });

  it.each(LINTED_PATHS)(
    'accepts a plain test, a condition wait and fake timers in %s',
    async (path) => {
      const code = [
        "it('a', async () => {",
        '  vi.useFakeTimers();',
        '  vi.advanceTimersByTime(100);',
        '  await vi.waitFor(() => expect(1).toBe(1));',
        '});',
        'export {};',
        ''
      ].join('\n');
      expect(await hygieneErrors(code, path)).toEqual([]);
    }
  );

  it('accepts a timer in production code', async () => {
    const code = 'await new Promise((resolve) => setTimeout(resolve, 100));\nexport {};\n';
    expect(await hygieneErrors(code, 'apps/api/src/example.ts')).toEqual([]);
  });

  it('applies the rules to every test file and to the test helpers', async () => {
    const paths = [...testFiles(root), 'apps/web/e2e/env.ts', 'apps/api/src/testing/database.ts'];
    const unlinted = [];
    for (const path of paths) {
      const config = await eslint.calculateConfigForFile(join(root, path));
      if (config?.rules?.['no-restricted-syntax']?.[0] !== 2) unlinted.push(path);
    }
    expect(unlinted).toEqual([]);
  });
});

describe('skipped tests', () => {
  it('accepts a test that runs', () => {
    expect(skipViolations("it('runs', () => {});\n", NOW)).toEqual([]);
  });

  it.each(['skip', 'skipIf(true)', 'runIf(false)', 'fixme', 'skip.each([1])'])(
    'rejects %s without its tag',
    (mode) => {
      expect(skipViolations(`\n${call(mode)}\n`, NOW)).toEqual([
        { line: 2, reason: 'skip without the tag `// skip: #<issue> until <YYYY-MM-DD>`' }
      ]);
    }
  );

  it('rejects a skip of a suite and a Playwright skip without its tag', () => {
    const text = ['describe.sk' + "ip('a', () => {});", 'test.describe.sk' + "ip('b', () => {});"];
    expect(skipViolations(text.join('\n'), NOW).map((v) => v.line)).toEqual([1, 2]);
  });

  it('rejects a tag without an issue number or with a malformed date', () => {
    const text = [
      call('skip', '// skip: until 2026-11-30'),
      call('skip', '// skip: #123 until 30/11/2026'),
      call('skip', '// skip: #123')
    ].join('\n');
    expect(skipViolations(text, NOW).map((v) => v.line)).toEqual([1, 2, 3]);
  });

  it('rejects a tag whose date does not exist', () => {
    expect(skipViolations(call('skip', '// skip: #123 until 2026-02-30'), NOW)).toEqual([
      { line: 1, reason: 'skip tag with a date that does not exist: 2026-02-30' }
    ]);
  });

  it('accepts a tagged skip up to its expiry date, and rejects it the day after', () => {
    const text = call('skip', '// skip: #123 until 2026-10-22');
    expect(skipViolations(text, NOW)).toEqual([]);
    expect(skipViolations(text, new Date('2026-10-22T23:59:59Z'))).toEqual([]);
    expect(skipViolations(text, new Date('2026-10-23T00:00:00Z'))).toEqual([
      { line: 1, reason: 'skip of #123 expired on 2026-10-22' }
    ]);
  });

  it('accepts the tag on the line above the skip, where Prettier keeps it', () => {
    const text = `describe('a', () => {\n  // skip: #45 until 2026-12-31\n  ${call('skip')}\n});`;
    expect(skipViolations(text, NOW)).toEqual([]);
  });

  it('rejects a tag two lines above the skip, or below it', () => {
    const above = `// skip: #45 until 2026-12-31\n\n${call('skip')}`;
    const below = `${call('skip')}\n// skip: #45 until 2026-12-31`;
    expect(skipViolations(above, NOW).map((v) => v.line)).toEqual([3]);
    expect(skipViolations(below, NOW).map((v) => v.line)).toEqual([1]);
  });

  it('does not lend the tag of one skip to the skip on the next line', () => {
    const text = `${call('skip', '// skip: #45 until 2026-12-31')}\n${call('skip')}`;
    expect(skipViolations(text, NOW).map((v) => v.line)).toEqual([2]);
  });

  it('accepts a tagged skip with a future date', () => {
    expect(skipViolations(call('skipIf(true)', '// skip: #45 until 2026-12-31'), NOW)).toEqual([]);
  });
});

describe('workspace', () => {
  it('reads the package globs of pnpm-workspace.yaml', () => {
    const text =
      "packages:\n  - apps/*\n  - 'tooling/*'\n  - docs\n\nallowBuilds:\n  esbuild: true\n";
    expect(workspaceGlobs(text)).toEqual(['apps/*', 'tooling/*', 'docs']);
  });

  it('reads a quoted entry like an unquoted one', () => {
    const text = 'packages:\n  - "apps/*"\n  - \'tooling/*\'\n  - docs\n';
    expect(workspaceGlobs(text)).toEqual(['apps/*', 'tooling/*', 'docs']);
  });

  it('reads list items that start at the first column', () => {
    expect(workspaceGlobs("packages:\n- apps/*\n- 'tooling/*'\nallowBuilds:\n")).toEqual([
      'apps/*',
      'tooling/*'
    ]);
  });

  it('refuses a packages key whose entries it cannot read', () => {
    expect(() => workspaceGlobs("packages: ['apps/*']\n")).toThrow("['apps/*']");
    expect(() => workspaceGlobs('packages:\n\nallowBuilds:\n')).toThrow('no entries');
  });

  it('returns no globs when the file has no packages key', () => {
    expect(workspaceGlobs('allowBuilds:\n  esbuild: true\n')).toEqual([]);
  });

  it('refuses a glob that the reader does not understand', () => {
    expect(() => workspaceGlobs('packages:\n  - apps/**\n')).toThrow('apps/**');
    expect(() => workspaceGlobs('packages:\n  - "!apps/old"\n')).toThrow('!apps/old');
  });

  describe('in a scratch workspace', () => {
    let scratch;

    afterEach(() => {
      if (scratch) rmSync(scratch, { recursive: true, force: true });
      scratch = undefined;
    });

    it('finds the packages of quoted entries', () => {
      scratch = mkdtempSync(join(tmpdir(), 'workspace-'));
      const files = {
        'pnpm-workspace.yaml': 'packages:\n  - \'apps/*\'\n  - "tooling/*"\n',
        'apps/api/package.json': '{}',
        'tooling/repo-contract/package.json': '{}'
      };
      for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(scratch, path)), { recursive: true });
        writeFileSync(join(scratch, path), text);
      }
      expect(workspacePackageDirs(scratch)).toEqual(['apps/api', 'tooling/repo-contract']);
    });
  });

  it('finds every package of the workspace', () => {
    const dirs = workspacePackageDirs(root);
    expect(dirs).toEqual(expect.arrayContaining(['apps/api', 'apps/web', 'tooling/repo-contract']));
  });

  it('gives every package of the workspace a test script', () => {
    const untested = workspacePackageDirs(root).filter((dir) => {
      const pkg = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
      return typeof pkg.scripts?.test !== 'string' || pkg.scripts.test.trim() === '';
    });
    expect(untested).toEqual([]);
  });
});

describe('test files of the repository', () => {
  const files = testFiles(root);

  it.each(TEST_KINDS)('finds at least one $kind', ({ pattern }) => {
    expect(files.filter((file) => pattern.test(file))).not.toEqual([]);
  });

  it('have no skip without its tag, and no expired skip', () => {
    const now = new Date();
    const violations = files.flatMap((file) =>
      skipViolations(readFileSync(join(root, file), 'utf8'), now).map((v) => ({ file, ...v }))
    );
    expect(violations).toEqual([]);
  });
});
