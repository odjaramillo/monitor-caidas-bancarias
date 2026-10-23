// Pins the metrics workflow (issue #121).
// Metrics only inform. The workflow must never write to the repository and never block a merge.
// These tests read `.github/workflows/metrics.yml` as text.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { REQUIRED_JOBS, contextOf, parseJobs } from './workflows.js';

const path = fileURLToPath(new URL('../../.github/workflows/metrics.yml', import.meta.url));

const READ_ONLY = ['contents: read', 'issues: read', 'pull-requests: read'];

// Returns the lines of a top-level key, without blank lines and comments.
function topLevelBlock(text, key) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.replace(/\s+#.*$/, '') === `${key}:`);
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^\S/.test(line));
  return (end < 0 ? rest : rest.slice(0, end))
    .map((line) => line.replace(/\s+#.*$/, ''))
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'));
}

function triggerViolations(text) {
  const triggers = topLevelBlock(text, 'on')
    .filter((line) => /^ {2}\S/.test(line))
    .map((line) => line.trim().replace(/:.*$/, ''));
  const expected = ['schedule', 'workflow_dispatch'];
  return [...triggers].sort().join() === expected.join()
    ? []
    : [`triggers must be exactly ${expected.join(' and ')}, not ${triggers.join(', ')}`];
}

// Removes the YAML comments: a line that starts with `#`, and ` #` up to the end of a line.
// A `#` inside single or double quotes is text, not a comment.
function withoutComments(text) {
  return text
    .split('\n')
    .map((line) => {
      let quote = null;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (quote) {
          if (char === quote) quote = null;
        } else if (char === "'" || char === '"') {
          quote = char;
        } else if (char === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
          return line.slice(0, i);
        }
      }
      return line;
    })
    .join('\n');
}

function permissionViolations(text) {
  const errors = [];
  const permissions = topLevelBlock(text, 'permissions').map((line) => line.trim());
  if ([...permissions].sort().join() !== READ_ONLY.join()) {
    errors.push(`permissions must be exactly ${READ_ONLY.join(', ')}`);
  }
  if (/^[ \t]+permissions:/m.test(text)) errors.push('a job must not change the permissions');
  if (/\bwrite(-all)?\b/.test(withoutComments(text).replace(/\$GITHUB_STEP_SUMMARY/g, ''))) {
    errors.push('the workflow must not ask for a write permission');
  }
  return errors;
}

function jobViolations(text) {
  const errors = [];
  const contexts = parseJobs(text).map(contextOf);
  const required = contexts.filter((context) => REQUIRED_JOBS.includes(context));
  if (required.length > 0) errors.push(`required check names: ${required.join(', ')}`);
  if (/\bgit\s+(push|commit)\b/.test(text)) errors.push('the workflow must not commit or push');
  if (!/persist-credentials: false/.test(text)) errors.push('checkout must drop its credentials');
  return errors;
}

/** Returns why a metrics workflow could write to the repository or block a merge. */
export function metricsWorkflowViolations(text) {
  return [...triggerViolations(text), ...permissionViolations(text), ...jobViolations(text)];
}

describe('.github/workflows/metrics.yml', () => {
  const text = readFileSync(path, 'utf8');

  it('only reads, never pushes, and is not a required check', () => {
    expect(metricsWorkflowViolations(text)).toEqual([]);
  });

  it('writes the table to the job summary and uploads the JSON', () => {
    const steps = parseJobs(text).flatMap((job) => job.steps);
    expect(
      steps.some((step) =>
        /^node tooling\/repo-contract\/process-metrics\.js .*--json "\$RUNNER_TEMP\/process-metrics\.json" >> "\$GITHUB_STEP_SUMMARY"$/.test(
          step.run ?? ''
        )
      )
    ).toBe(true);
    expect(steps.some((step) => /^actions\/upload-artifact@/.test(step.uses ?? ''))).toBe(true);
  });
});

describe('metrics workflow rules', () => {
  const text = readFileSync(path, 'utf8');

  it.each([
    ['a write permission', text.replace('contents: read', 'contents: write'), /write permission/],
    [
      'a job-level permission',
      text.replace('    runs-on:', '    permissions: {}\n    runs-on:'),
      /job/
    ],
    ['a git push step', `${text}      - run: git push origin HEAD:main\n`, /commit or push/],
    ['a git commit step', `${text}      - run: git commit -am metrics\n`, /commit or push/],
    ['a pull_request trigger', text.replace('  workflow_dispatch:', '  pull_request:'), /triggers/],
    ['a required check name', text.replace('  metrics:', '  checks:'), /required check/],
    [
      'kept credentials',
      text.replace('persist-credentials: false', 'fetch-depth: 1'),
      /credentials/
    ],
    [
      'write after a # inside quotes',
      text.replace("cron: '0 6 * * 1'", "cron: '0 6 * * 1 # write'"),
      /write permission/
    ]
  ])('rejects %s', (_, broken, message) => {
    const violations = metricsWorkflowViolations(broken);
    expect(
      violations.some((violation) => message.test(violation)),
      violations.join('; ')
    ).toBe(true);
  });

  // A comment is not a permission. Only the keys and values of the workflow ask for access.
  it('accepts the word write in a full-line or a trailing comment', () => {
    const commented = text
      .replace('permissions:\n', '# The job must never write.\npermissions: # no write scope\n')
      .replace('  contents: read', '  contents: read # not write');
    expect(commented).not.toBe(text);
    expect(metricsWorkflowViolations(commented)).toEqual([]);
  });
});
