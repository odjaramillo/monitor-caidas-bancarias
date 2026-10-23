// Pins the mutation testing gate of levels.ts (issue #119).
// The break threshold must come from a dated measurement, and the gate must stay off the merge path.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import strykerConfig from '../../apps/api/stryker.config.mjs';
import vitestStrykerConfig from '../../apps/api/vitest.stryker.config.ts';
import { REQUIRED_JOBS, jobByContext, readWorkflows } from './workflows.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const baseline = JSON.parse(readFileSync(join(root, 'apps/api/mutation-baseline.json'), 'utf8'));
const workflow = readFileSync(join(root, '.github/workflows/mutation.yml'), 'utf8');

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COMMIT = /^[0-9a-f]{7,40}$/;

// Scores have two decimals. Rounding keeps the subtraction exact.
function round(value) {
  return Math.round(value * 100) / 100;
}

describe('mutation baseline', () => {
  it('records at least three dated runs on a commit', () => {
    expect(baseline.runs.length).toBeGreaterThanOrEqual(3);
    for (const run of baseline.runs) {
      expect(run.date).toMatch(DATE);
      expect(run.commit).toMatch(COMMIT);
      expect(typeof run.score).toBe('number');
    }
  });

  it('sets the threshold to the lowest score minus the jitter of the runs', () => {
    const scores = baseline.runs.map((run) => run.score);
    const jitter = round(Math.max(...scores) - Math.min(...scores));
    expect(baseline.score).toBe(Math.min(...scores));
    expect(baseline.jitter).toBe(jitter);
    expect(baseline.threshold).toBe(round(baseline.score - jitter));
  });

  it('says when and where the score was measured', () => {
    expect(baseline.date).toMatch(DATE);
    expect(baseline.commit).toMatch(COMMIT);
    expect(baseline.premise).toEqual(expect.any(String));
  });
});

describe('Stryker config', () => {
  it('mutates only levels.ts', () => {
    expect(strykerConfig.mutate).toEqual(['src/levels.ts']);
  });

  it('reads the break threshold from the baseline file', () => {
    expect(strykerConfig.thresholds.break).toBe(baseline.threshold);
  });

  it('runs the levels.ts tests without the database setup', () => {
    expect(strykerConfig.commandRunner.command).toMatch(/ --config vitest\.stryker\.config\.ts$/);
    expect(vitestStrykerConfig.test.include).toEqual(['src/levels.test.ts']);
    expect(vitestStrykerConfig.test.globalSetup).toBeUndefined();
  });
});

describe('mutation workflow', () => {
  const mutation = jobByContext(readWorkflows(join(root, '.github/workflows')), 'mutation');

  it('runs every week and on a PR with the mutation label', () => {
    expect(workflow).toMatch(/^ {2}schedule:\n {4}- cron: '[^']+'/m);
    expect(mutation.if).toBe(
      "github.event_name != 'pull_request' || contains(github.event.pull_request.labels.*.name, 'mutation')"
    );
  });

  it('is not a required check', () => {
    expect(REQUIRED_JOBS).not.toContain('mutation');
  });
});
