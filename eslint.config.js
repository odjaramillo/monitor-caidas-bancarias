import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
  { ignores: ['**/dist', '**/build', '**/.svelte-kit', '**/coverage'] },
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
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: ts.parser } }
  }
);
