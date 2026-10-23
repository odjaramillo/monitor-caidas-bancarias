// Pins the CI contract (issue #114).
// The ruleset of `main` matches status checks by job name, so a renamed job removes its gate in silence.
// These tests read the workflow files as text and fail when a gate disappears.

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
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
  { job: 'checks', gate: 'dependency audit', run: /^pnpm audit:prod$/ },
  { job: 'checks', gate: 'commitlint', run: /^pnpm exec commitlint --from .+ --to .+$/ },
  { job: 'checks', gate: 'lint', run: /^pnpm lint$/ },
  { job: 'checks', gate: 'typecheck', run: /^pnpm typecheck$/ },
  { job: 'checks', gate: 'test', run: /^pnpm test$/ },
  { job: 'checks', gate: 'coverage ratchet', run: /^pnpm coverage:check$/ },
  { job: 'checks', gate: 'build', run: /^pnpm build$/ },
  { job: 'checks', gate: 'browser tests', run: /^pnpm --filter web test:e2e$/ },
  { job: 'docker', gate: 'compose.yaml validation', run: /^docker compose config -q$/ },
  { job: 'docker', gate: 'API image build', uses: /^docker\/build-push-action@/ },
  { job: 'docker', gate: 'boot refusal without DATABASE_URL', run: /DATABASE_URL is not set/ },
  {
    job: 'docker',
    gate: 'boot and /health',
    run: /curl -fsS --max-time \d+ http:\/\/localhost:3000\/health/
  },
  {
    job: 'docker',
    gate: 'dead container stops the /health wait',
    run: /if \[ "\$\(docker inspect -f '\{\{\.State\.Running\}\}' api\)" != true \]; then\n.+\ndocker logs api\nexit 1\n/
  },
  {
    job: 'secrets',
    gate: 'gitleaks binary with a verified checksum',
    run: /^printf '%s {2}%s\\n' "\$GITLEAKS_SHA256" "\$archive" \| sha256sum -c -$/m
  },
  {
    job: 'secrets',
    gate: 'shallow checkout refusal',
    run: /if \[ "\$\(git rev-parse --is-shallow-repository\)" != false \]; then\n.+\nexit 1\n/
  },
  {
    job: 'secrets',
    gate: 'gitleaks over the full history',
    run: /^"\$RUNNER_TEMP\/gitleaks" git --redact --verbose --exit-code 1 --log-opts="--full-history --all --diff-filter=tuxdb" \.$/m
  },
  { job: 'issue', gate: 'PR links its issue', run: /grep -Eiq '.*close\[sd\]\?.*sin-issue/ },
  // deploy is not a required check: it runs after the merge (D23). These rows keep its steps real.
  {
    job: 'deploy',
    gate: 'empty Deploy Hook secret',
    run: /if \[ -z "\$RENDER_DEPLOY_HOOK_URL" \]; then\n.+\nexit 1\n/
  },
  {
    job: 'deploy',
    gate: 'Render Deploy Hook call',
    run: /^curl -sS --fail --max-time \d+ -X POST .*"\$\{RENDER_DEPLOY_HOOK_URL\}.*ref=\$\{EXPECTED_COMMIT\}"$/m
  },
  {
    job: 'deploy',
    gate: '/health with the deployed commit',
    run: /curl -sS --max-time .+ "\$HEALTH_URL"[\s\S]+\.commit[\s\S]+\[ "\$code" = 200 \] && \[ "\$commit" = "\$EXPECTED_COMMIT" \]/
  },
  // mutation is not a required check: it runs every week and on a labelled PR (#119).
  {
    job: 'mutation',
    gate: 'Stryker with the break threshold',
    run: /^pnpm --filter api test:mutation 2>&1 \| tee "\$RUNNER_TEMP\/mutation\.log"$/
  }
];

// CI commands that `pnpm verify` does not run. docs/calidad.md names each one and its reason.
const LOCAL_EXCEPTIONS = [
  { ci: /^pnpm exec commitlint /, docs: 'pnpm exec commitlint' },
  { ci: /^pnpm --filter web exec playwright install /, docs: 'playwright install --with-deps' },
  { ci: /^pnpm --filter web test:e2e$/, docs: 'pnpm --filter web test:e2e' }
];

// A tag can move to another commit. A full commit SHA cannot. The comment keeps the tag readable.
const PINNED_USES = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+(\.\d+)*$/;

// Returns every `uses:` value of every workflow, with its trailing comment.
function usesValues() {
  return readdirSync(workflowsDir)
    .filter((file) => /\.ya?ml$/.test(file))
    .flatMap((file) =>
      [
        ...readFileSync(join(workflowsDir, file), 'utf8').matchAll(/^\s*(?:- )?uses:\s*(.+)$/gm)
      ].map((match) => ({ file, uses: match[1].trim() }))
    );
}

function rootScripts() {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {};
}

function verifyCommands() {
  return (rootScripts().verify ?? '').split(' && ').filter((command) => command !== '');
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

  it('deploys only after the required jobs pass on a push to main', () => {
    const deploy = jobByContext(jobs, 'deploy');
    expect(deploy, 'job deploy').toBeDefined();
    expect(deploy.needs).toBe('[checks, docker, secrets]');
    expect(deploy.if).toBe("github.event_name == 'push' && github.ref == 'refs/heads/main'");
  });

  it('pins every Action to a full commit SHA with its tag in a comment', () => {
    const values = usesValues();
    expect(values.length, 'uses: lines').toBeGreaterThan(0);
    expect(values.filter(({ uses }) => !PINNED_USES.test(uses))).toEqual([]);
  });

  it('runs the audit gate script in pnpm audit:prod', () => {
    expect(rootScripts()['audit:prod']).toBe('node tooling/repo-contract/audit-gate.js');
  });

  it('runs the ratchet script in pnpm coverage:check and pnpm coverage:ratchet', () => {
    expect(rootScripts()['coverage:check']).toBe('node tooling/repo-contract/coverage-ratchet.js');
    expect(rootScripts()['coverage:ratchet']).toBe(
      'pnpm test && node tooling/repo-contract/coverage-ratchet.js --write'
    );
  });

  it('checks the coverage floors right after the tests that write the coverage', () => {
    const runs = jobByContext(jobs, 'checks').steps.map((step) => step.run);
    expect(runs[runs.indexOf('pnpm test') + 1]).toBe('pnpm coverage:check');
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

  it('keeps the needs and if values of a job', () => {
    const text = [
      'jobs:',
      '  deploy:',
      '    needs: [checks, docker] # after the gates',
      "    if: github.ref == 'refs/heads/main'",
      '    steps:',
      '      - run: x'
    ].join('\n');
    const [job] = parseJobs(text);
    expect([job.needs, job.if]).toEqual(['[checks, docker]', "github.ref == 'refs/heads/main'"]);
  });

  it('uses the job name as the status-check context', () => {
    const text = ['jobs:', '  build:', '    name: checks', '    steps:', '      - run: x'].join(
      '\n'
    );
    expect(parseJobs(text).map(contextOf)).toEqual(['checks']);
  });
});

// Runs the step script like GitHub Actions does for a `bash` shell.
function runStep(step, env) {
  const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', step.run], {
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8'
  });
  return { status: result.status, stdout: result.stdout };
}

describe('issue gate', () => {
  const issue = jobByContext(readWorkflows(workflowsDir), 'issue');
  const step = issue.steps.find((candidate) => /grep -Eiq/.test(candidate.run ?? ''));
  const prWorkflow = readFileSync(join(workflowsDir, 'pr.yml'), 'utf8');

  it('runs for every PR: a skipped required check counts as a pass', () => {
    expect(issue.if).toBeNull();
    expect(step.if).toBeUndefined();
  });

  it('reads the PR author, not the actor of the event', () => {
    expect(prWorkflow).toMatch(
      /^ +PR_AUTHOR: \$\{\{ github\.event\.pull_request\.user\.login \}\}/m
    );
  });

  it.each([
    { author: 'odjaramillo', body: 'Closes #5', status: 0 },
    { author: 'odjaramillo', body: 'Cierra #5', status: 1 },
    { author: 'odjaramillo', body: '', status: 1 },
    { author: 'dependabot', body: '', status: 1 },
    { author: 'dependabot[bot]', body: '', status: 0 }
  ])('gives exit $status to a PR of $author with the body "$body"', ({ author, body, status }) => {
    expect(runStep(step, { PR_AUTHOR: author, BODY: body }).status).toBe(status);
  });

  it('says why a Dependabot PR passes without an issue', () => {
    const { stdout } = runStep(step, { PR_AUTHOR: 'dependabot[bot]', BODY: '' });
    expect(stdout).toMatch(/^::notice::.*Dependabot/m);
  });
});
