import { defineConfig } from 'vitest/config';

// Stryker runs this config, not vitest.config.ts (issue #119).
// levels.ts is pure, so its tests need no database. This config has no global setup, and Stryker
// runs without PostgreSQL. Coverage is off: Stryker measures the tests by their mutation score.
export default defineConfig({
  test: {
    include: ['src/levels.test.ts'],
    coverage: { enabled: false }
  }
});
