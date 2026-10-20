import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      // pnpm test always measures coverage, so the floor below runs in CI.
      enabled: true,
      provider: 'v8',
      // app.html is a template, not code, so it stays out of the report.
      include: ['src/**/*.{ts,svelte}'],
      reporter: ['text-summary'],
      // Floor = coverage measured on 2026-10-20 at commit 0c53616 plus layout.test.ts (issue #70, decision D16).
      // Raise these numbers when coverage rises. Never lower them to make CI green.
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100
      }
    }
  },
  plugins: [
    sveltekit({
      compilerOptions: {
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes('node_modules') ? undefined : true
      },

      // adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
      // If your environment is not supported, or you settled on a specific environment, switch out the adapter.
      // See https://svelte.dev/docs/kit/adapters for more information about adapters.
      adapter: adapter()
    })
  ]
});
