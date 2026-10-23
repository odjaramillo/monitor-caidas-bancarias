// Pins the CI contract (issue #114).
// The ruleset of `main` matches status checks by job name, so a renamed job removes its gate in silence.
// These tests read the workflow files as text and fail when a gate disappears.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  REQUIRED_JOBS,
  contextOf,
  isCheckStep,
  jobByContext,
  noOpJobs,
  parseJobs,
  readWorkflows
} from './workflows.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const workflowsDir = join(root, '.github/workflows');

// Each gate names its job and the step that runs it.
const GATES = [
  { job: 'checks', gate: 'frozen-lockfile install', run: /^pnpm install --frozen-lockfile$/ },
  { job: 'checks', gate: 'dependency audit', run: /^pnpm audit --prod --audit-level high$/ },
  { job: 'checks', gate: 'commitlint', run: /^pnpm exec commitlint --from .+ --to .+$/ },
  { job: 'checks', gate: 'lint', run: /^pnpm lint$/ },
  { job: 'checks', gate: 'typecheck', run: /^pnpm typecheck$/ },
  { job: 'checks', gate: 'test', run: /^pnpm test$/ },
  { job: 'checks', gate: 'build', run: /^pnpm build$/ },
  { job: 'checks', gate: 'browser tests', run: /^pnpm --filter web test:e2e$/ },
  { job: 'docker', gate: 'compose.yaml validation', run: /^docker compose config -q$/ },
  { job: 'docker', gate: 'API image build', uses: /^docker\/build-push-action@/ },
  { job: 'docker', gate: 'boot refusal without DATABASE_URL', run: /DATABASE_URL is not set/ },
  { job: 'docker', gate: 'boot and /health', run: /curl \S+ http:\/\/localhost:3000\/health/ },
  { job: 'secrets', gate: 'gitleaks', uses: /^gitleaks\/gitleaks-action@/ },
  { job: 'issue', gate: 'PR links its issue', run: /grep -Eiq '.*close\[sd\]\?.*sin-issue/ }
];

// CI commands that `pnpm verify` does not run. docs/calidad.md names each one and its reason.
const LOCAL_EXCEPTIONS = [
  { ci: /^pnpm exec commitlint /, docs: 'pnpm exec commitlint' },
  { ci: /^pnpm --filter web exec playwright install /, docs: 'playwright install --with-deps' },
  { ci: /^pnpm --filter web test:e2e$/, docs: 'pnpm --filter web test:e2e' }
];

function verifyCommands() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  return (pkg.scripts?.verify ?? '').split(' && ').filter((command) => command !== '');
}

describe('CI contract', () => {
  const jobs = readWorkflows(workflowsDir);

  it('keeps every required job under its required name', () => {
    const contexts = jobs.map(contextOf);
    expect(REQUIRED_JOBS.filter((name) => !contexts.includes(name))).toEqual([]);
  });

  it.each(GATES)('$job still runs the $gate gate', ({ job: context, run, uses }) => {
    const job = jobByContext(jobs, context);
    expect(job, `job ${context}`).toBeDefined();
    const step = job.steps.find(
      (candidate) =>
        (run && run.test(candidate.run ?? '')) || (uses && uses.test(candidate.uses ?? ''))
    );
    expect(step, `step for ${run ?? uses}`).toBeDefined();
    expect(isCheckStep(job, step), 'the step is skipped or cannot fail the job').toBe(true);
  });

  it('has no job with only setup steps', () => {
    expect(noOpJobs(jobs)).toEqual([]);
  });

  it('pnpm verify runs the commands of the checks job in the same order', () => {
    const checks = jobByContext(jobs, 'checks');
    const ciCommands = checks.steps
      .filter((step) => step.run !== undefined)
      .map((step) => step.run)
      .filter((command) => !LOCAL_EXCEPTIONS.some((exception) => exception.ci.test(command)));
    expect(verifyCommands()).toEqual(ciCommands);
  });

  it('docs/calidad.md names each CI command that pnpm verify does not run', () => {
    const docs = readFileSync(join(root, 'docs/calidad.md'), 'utf8');
    const missing = LOCAL_EXCEPTIONS.filter((exception) => !docs.includes(exception.docs));
    expect(missing.map((exception) => exception.docs)).toEqual([]);
  });
});

describe('workflow reader', () => {
  it('finds a job with only setup and echo steps', () => {
    const text = [
      'jobs:',
      '  empty:',
      '    steps:',
      '      - uses: actions/checkout@v7',
      '      - uses: actions/setup-node@v7',
      '      - run: echo ok',
      '  real:',
      '    steps:',
      '      - run: pnpm test'
    ].join('\n');
    expect(noOpJobs(parseJobs(text))).toEqual(['empty']);
  });

  it('does not count a disabled step as a check', () => {
    const text = [
      'jobs:',
      '  skipped:',
      '    steps:',
      '      - run: pnpm test',
      '        if: false',
      '  tolerant:',
      '    steps:',
      '      - run: pnpm lint',
      '        continue-on-error: true'
    ].join('\n');
    expect(noOpJobs(parseJobs(text))).toEqual(['skipped', 'tolerant']);
  });

  it('uses the job name as the status-check context', () => {
    const text = ['jobs:', '  build:', '    name: checks', '    steps:', '      - run: x'].join(
      '\n'
    );
    expect(parseJobs(text).map(contextOf)).toEqual(['checks']);
  });
});
