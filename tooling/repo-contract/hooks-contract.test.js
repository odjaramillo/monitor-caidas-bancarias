// Pins the Git hooks in `.husky/` (issue #112).
// A hook runs only on the machine of the author, and `--no-verify` skips it.
// So each hook step must also run in a required CI job, and a removed step must fail a test.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hookSteps } from './hooks.js';
import { REQUIRED_JOBS, isCheckStep, jobByContext, readWorkflows } from './workflows.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const huskyDir = join(root, '.husky');

// Each hook lists its steps in order. Each step names the required CI job and step that repeat it.
const HOOKS = {
  'commit-msg': [
    {
      step: 'pnpm exec commitlint --edit "$1"',
      job: 'checks',
      ci: /^pnpm exec commitlint --from .+ --to .+$/
    }
  ],
  'pre-commit': [{ step: 'pnpm exec lint-staged', job: 'checks', ci: /^pnpm lint$/ }],
  'pre-push': [
    { step: 'pnpm --filter "...[$base]" typecheck', job: 'checks', ci: /^pnpm typecheck$/ },
    { step: 'pnpm --filter "...[$base]" test', job: 'checks', ci: /^pnpm test$/ }
  ]
};

const STEPS = Object.entries(HOOKS).flatMap(([hook, steps]) =>
  steps.map((step) => ({ hook, ...step }))
);

// Husky keeps its generated wrappers in `.husky/_`. They are not hooks of this repository.
function hookFiles() {
  return readdirSync(huskyDir)
    .filter((name) => statSync(join(huskyDir, name)).isFile())
    .sort();
}

function readHook(hook) {
  return readFileSync(join(huskyDir, hook), 'utf8');
}

describe('Git hooks contract', () => {
  const jobs = readWorkflows(join(root, '.github/workflows'));

  it('has exactly the pinned hooks', () => {
    expect(hookFiles()).toEqual(Object.keys(HOOKS).sort());
  });

  it.each(Object.entries(HOOKS))('%s runs the pinned steps in order', (hook, steps) => {
    expect(hookSteps(readHook(hook))).toEqual(steps.map(({ step }) => step));
  });

  it.each(STEPS)('$hook step "$step" repeats in the required job $job', ({ job, ci }) => {
    expect(REQUIRED_JOBS).toContain(job);
    const ciJob = jobByContext(jobs, job);
    expect(ciJob, `job ${job}`).toBeDefined();
    const ciStep = ciJob.steps.find((candidate) => ci.test(candidate.run ?? ''));
    expect(ciStep, `step for ${ci}`).toBeDefined();
    expect(isCheckStep(ciJob, ciStep), 'the step is skipped or cannot fail the job').toBe(true);
  });
});

describe('hook reader', () => {
  it('keeps only the pnpm lines, in order', () => {
    const text = [
      '# A comment',
      'base=$(git merge-base HEAD origin/main)',
      'pnpm exec lint-staged',
      'if [ -n "$x" ]; then',
      '  pnpm test',
      'fi'
    ].join('\n');
    expect(hookSteps(text)).toEqual(['pnpm exec lint-staged', 'pnpm test']);
  });
});
