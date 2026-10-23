import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // A focused test in CI would hide the others (issue #118). This is also the Vitest default.
    allowOnly: !process.env.CI,
    // Applies the migrations to the test database once, before any test file runs (issue #20).
    globalSetup: ['src/testing/global-setup.ts'],
    coverage: {
      // pnpm test always measures coverage, so the floor below runs in CI.
      enabled: true,
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Test helpers are not shipped in the image (tsconfig.build.json), so they do not count.
      exclude: ['src/testing/**'],
      reporter: ['text-summary', 'json-summary'],
      // Floor = coverage measured on 2026-10-22 at commit 831a782, main CI run 39883754785 (decision D16).
      // server.ts is the entry point and has no unit test; the docker job boots it instead.
      // seed-demo.ts only wires demo-seed.ts to the terminal, so it has no unit test either.
      // CI fails when coverage rises above these numbers, so run pnpm coverage:ratchet (issue #120).
      // Never lower them to make CI green.
      thresholds: {
        statements: 89.95,
        branches: 92.3,
        functions: 98.18,
        lines: 89.58
      }
    }
  }
});
