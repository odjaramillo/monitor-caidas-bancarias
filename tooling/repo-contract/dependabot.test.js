// Pins the Dependabot setup (issue #46).
// Dependabot opens one grouped PR per ecosystem each month.
// Its commits must pass commitlint without an exception for its author.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));

// A cold start of commitlint loads its config. It takes about 1 s here.
// The limits leave room for a slow or loaded CI runner.
const PROCESS_TIMEOUT_MS = 30_000;
const TEST_TIMEOUT_MS = 60_000;

// Runs commitlint of the root package on one message, like the `checks` job does.
// A process that does not finish in time fails the test with its own message.
function commitlint(message, timeout = PROCESS_TIMEOUT_MS) {
  const result = spawnSync(join(root, 'node_modules/.bin/commitlint'), [], {
    cwd: root,
    input: message,
    encoding: 'utf8',
    timeout
  });
  if (result.error?.code === 'ETIMEDOUT') {
    throw new Error(
      `commitlint did not finish within ${timeout} ms. The machine is slow or commitlint hangs.`
    );
  }
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
}

const LONG_LINE =
  '- [Commits](https://github.com/eslint/eslint/compare/v10.12.0...v10.13.0/with/a/path/longer/than/100/characters)';

const SIGN_OFF = 'Signed-off-by: dependabot[bot] <support@github.com>';

// The shape of a grouped Dependabot commit: release-note links and a YAML block in the body.
const DEPENDABOT_COMMIT = [
  'chore(deps): bump the npm group across 4 directories with 2 updates',
  '',
  'Bumps the npm group with 2 updates in the / directory: [eslint](https://github.com/eslint/eslint) and [vitest](https://github.com/vitest-dev/vitest/tree/HEAD/packages/vitest).',
  '',
  'Updates `eslint` from 10.12.0 to 10.13.0',
  '- [Release notes](https://github.com/eslint/eslint/releases)',
  LONG_LINE,
  '',
  '---',
  'updated-dependencies:',
  '- dependency-name: eslint',
  '  dependency-version: 10.13.0',
  '  dependency-type: direct:development',
  '  update-type: version-update:semver-minor',
  '  dependency-group: npm',
  '...',
  '',
  SIGN_OFF,
  ''
].join('\n');

// Each test starts one commitlint process, so each test gets the larger limit.
describe('commitlint and Dependabot commits', { timeout: TEST_TIMEOUT_MS }, () => {
  it('fails with a clear message when commitlint does not finish in time', () => {
    expect(() => commitlint('chore: x', 1)).toThrow(
      'commitlint did not finish within 1 ms. The machine is slow or commitlint hangs.'
    );
  });

  // commitlint skips the length check on a line with a URL. Dependabot writes its long lines as links.
  it('accepts a grouped Dependabot commit with body lines longer than 100 characters', () => {
    expect(DEPENDABOT_COMMIT.split('\n').some((line) => line.length > 100)).toBe(true);
    const result = commitlint(DEPENDABOT_COMMIT);
    expect(result.output).toBe('');
    expect(result.status).toBe(0);
  });

  it('accepts a Dependabot commit of the github-actions group', () => {
    const message = DEPENDABOT_COMMIT.replace(
      /^chore\(deps\): .*$/m,
      'ci(deps): bump the actions group with 3 updates'
    );
    expect(commitlint(message).status).toBe(0);
  });

  it('rejects a commit with a body line of 101 characters and no URL', () => {
    const message = ['chore(deps): bump eslint', '', 'x'.repeat(101), '', SIGN_OFF].join('\n');
    const result = commitlint(message);
    expect(result.output).toMatch(/body-max-line-length/);
    expect(result.status).toBe(1);
  });
});

// Splits `.github/dependabot.yml` into its `updates` entries, as raw text without quotes.
function updateEntries() {
  const text = readFileSync(join(root, '.github/dependabot.yml'), 'utf8').replace(/['"]/g, '');
  return text
    .split(/^ {2}- (?=package-ecosystem:)/m)
    .slice(1)
    .map((entry) => ({ ecosystem: /^package-ecosystem: ([\w-]+)/.exec(entry)?.[1], entry }));
}

describe('.github/dependabot.yml', () => {
  const entries = updateEntries();

  it('updates exactly the npm and github-actions ecosystems', () => {
    expect(entries.map((e) => e.ecosystem).sort()).toEqual(['github-actions', 'npm']);
  });

  it.each(entries)('$ecosystem runs monthly and groups every update in one PR', ({ entry }) => {
    expect(entry).toMatch(/^ {4}schedule:\n {6}interval: monthly$/m);
    expect(entry).toMatch(/^ {4}groups:\n {6}[\w-]+:\n {8}patterns:\n {10}- \*$/m);
  });

  it.each([
    { ecosystem: 'npm', prefix: 'chore' },
    { ecosystem: 'github-actions', prefix: 'ci' }
  ])('$ecosystem commits start with $prefix(deps)', ({ ecosystem, prefix }) => {
    const { entry } = entries.find((e) => e.ecosystem === ecosystem);
    expect(entry).toMatch(
      new RegExp(`^ {4}commit-message:\\n {6}prefix: ${prefix}\\n {6}include: scope$`, 'm')
    );
  });
});
