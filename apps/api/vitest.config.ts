import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      // pnpm test always measures coverage, so the floor below runs in CI.
      enabled: true,
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary'],
      // Floor = coverage measured on 2026-10-20 at commit 0c53616 (issue #70, decision D16).
      // server.ts is the entry point and has no unit test; the docker job boots it instead.
      // Raise these numbers when coverage rises. Never lower them to make CI green.
      thresholds: {
        statements: 31.25,
        branches: 33.33,
        functions: 66.66,
        lines: 26.66
      }
    }
  }
});
