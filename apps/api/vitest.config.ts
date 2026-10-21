import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Applies the migrations to the test database once, before any test file runs (issue #20).
    globalSetup: ['src/testing/global-setup.ts'],
    coverage: {
      // pnpm test always measures coverage, so the floor below runs in CI.
      enabled: true,
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Test helpers are not shipped in the image (tsconfig.build.json), so they do not count.
      exclude: ['src/testing/**'],
      reporter: ['text-summary'],
      // Floor = coverage measured on 2026-10-21 with POST /reports (issue #5, decision D16).
      // server.ts is the entry point and has no unit test; the docker job boots it instead.
      // Raise these numbers when coverage rises. Never lower them to make CI green.
      thresholds: {
        statements: 76.05,
        branches: 80,
        functions: 92.85,
        lines: 76.11
      }
    }
  }
});
