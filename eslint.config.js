import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
  {
    // Stryker writes its report to apps/api/reports.
    // It leaves its sandbox in .stryker-tmp when a run stops early.
    ignores: [
      '**/dist',
      '**/build',
      '**/.svelte-kit',
      '**/coverage',
      '**/.stryker-tmp',
      'apps/api/reports'
    ]
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      // Functions above this complexity are hard to test.
      complexity: ['error', 10]
    }
  },
  {
    // Caps on the shape of production functions (issue #120).
    // Premise: `node tooling/repo-contract/function-shape.js` measured 76 functions in 23 files
    // on 2026-10-22 at commit 831a782. p95 and maximum: 3 and 4 parameters, depth 2 and 2,
    // 30 and 61 lines without blank and comment lines. Each cap is the p95 plus 1.
    // A function above a cap before #120 carries a disable comment with its tracking issue.
    // tooling/repo-contract/function-shape.test.js pins the list of those comments.
    // Measure again and update docs/calidad.md before you change a cap. Never raise a cap to pass lint.
    // Tests and test helpers stay outside: a `describe` callback is long by design.
    files: ['apps/*/src/**/*.{ts,svelte}'],
    ignores: ['**/*.test.ts', 'apps/api/src/testing/**'],
    // A disable comment that no longer hides an error fails lint, so the old violations only shrink.
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      'max-params': ['error', { max: 4 }],
      'max-depth': ['error', { max: 3 }],
      'max-lines-per-function': [
        'error',
        { max: 31, skipBlankLines: true, skipComments: true, IIFEs: true }
      ]
    }
  },
  {
    // levels.ts holds the level rules. Its tests need no database and no server (issue #115).
    files: ['apps/api/src/levels.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^(pg|fastify|@fastify/.*|node-pg-migrate)(/.*)?$|^\\.\\.?/(.*/)?(app|config|db|demo-seed|reports|seed-demo|server|start|status-worker|testing/.*)(\\.[jt]s)?$',
              message:
                'levels.ts holds pure domain logic, so it must not import a database, HTTP server or I/O module.'
            }
          ]
        }
      ]
    }
  },
  {
    // Every test runs, and no test waits a fixed time (issue #118).
    // tooling/repo-contract/test-hygiene.test.js checks a skip, its issue and its expiry date.
    files: [
      '**/*.test.{ts,js}',
      '**/*.e2e.ts',
      'apps/web/e2e/**/*.ts',
      'apps/api/src/testing/**/*.ts'
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='only']",
          message: 'A focused test hides the other tests. Remove `.only`.'
        },
        {
          selector: "MemberExpression[property.name='todo']",
          message:
            'A pending test leaves the count in silence. Write the test, or track it in an issue.'
        },
        ...[
          "NewExpression[callee.name='Promise'] CallExpression[callee.name='setTimeout']",
          "CallExpression[callee.property.name='waitForTimeout']",
          'ImportDeclaration[source.value=/^(node:)?timers.promises$/]',
          "CallExpression[callee.name='sleep']"
        ].map((selector) => ({
          selector,
          message:
            'A fixed wait makes the tests slow and flaky. Wait for a condition, or use fake timers.'
        }))
      ]
    }
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: ts.parser } }
  }
);
