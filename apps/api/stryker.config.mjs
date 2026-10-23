// Mutation testing of the pure domain logic in levels.ts (issue #119).
// Stryker changes the code one mutant at a time and runs the tests. A mutant that no test detects
// shows a line that the tests run but do not check.
import { readFileSync } from 'node:fs';

// The break threshold comes from a dated measurement. mutation-baseline.json holds the runs, the
// commit, the jitter and the premise. Change the threshold there, never here.
const baseline = JSON.parse(
  readFileSync(new URL('./mutation-baseline.json', import.meta.url), 'utf8')
);
if (typeof baseline.threshold !== 'number') {
  throw new Error('mutation-baseline.json has no numeric threshold.');
}

export default {
  // The command runner runs all the tests of levels.ts once per mutant (D25).
  // @stryker-mutator/vitest-runner 10.0.0 filters the tests by a name that Vitest 5 does not match,
  // so it runs no test and every mutant survives.
  testRunner: 'command',
  commandRunner: { command: 'node_modules/.bin/vitest run --config vitest.stryker.config.ts' },
  mutate: ['src/levels.ts'],
  reporters: ['clear-text', 'progress', 'html'],
  // The job summary shows the score table, so the log keeps no list of mutants.
  clearTextReporter: { reportMutants: false, reportTests: false, allowColor: false },
  thresholds: { break: baseline.threshold },
  // A failed run must not leave copies of the sources for ESLint and Vitest to find.
  cleanTempDir: 'always'
};
