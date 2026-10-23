// Checks the dependency audit gate (issue #117).
// The gate must fail closed: a missing or broken report fails, and so does an expired allowlist entry.

import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { errorCommand, evaluate } from './audit-gate.js';

const script = fileURLToPath(new URL('./audit-gate.js', import.meta.url));
const NOW = new Date('2026-10-22T15:00:00Z');

function advisory(id, severity) {
  return { id: 1, github_advisory_id: id, severity, module_name: 'pkg', title: `${id} title` };
}

// Builds the output of `pnpm audit --prod --json`. pnpm exits 1 when it finds any advisory.
function audit(...advisories) {
  const report = {
    advisories: Object.fromEntries(advisories.map((item, i) => [String(i + 1), item])),
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } }
  };
  return { status: advisories.length > 0 ? 1 : 0, stdout: JSON.stringify(report), stderr: '' };
}

function entry(id, expires, reason = 'No fix yet; the vulnerable path is not reachable') {
  return { id, reason, expires };
}

function allowlist(...entries) {
  return { advisories: entries };
}

describe('dependency audit gate', () => {
  it('passes a report with only low and moderate advisories', () => {
    const result = evaluate(
      audit(advisory('GHSA-aaaa', 'low'), advisory('GHSA-bbbb', 'moderate')),
      allowlist(),
      NOW
    );
    expect(result.errors).toEqual([]);
  });

  it('fails on each high or critical advisory that the allowlist does not name', () => {
    const result = evaluate(
      audit(advisory('GHSA-high', 'high'), advisory('GHSA-crit', 'critical')),
      allowlist(),
      NOW
    );
    expect(result.errors).toEqual([
      'high advisory GHSA-high in pkg is not in audit-allowlist.json: GHSA-high title',
      'critical advisory GHSA-crit in pkg is not in audit-allowlist.json: GHSA-crit title'
    ]);
  });

  it('accepts an allowed high advisory up to the last day of its entry', () => {
    const result = evaluate(
      audit(advisory('GHSA-high', 'high')),
      allowlist(entry('GHSA-high', '2026-10-22')),
      NOW
    );
    expect(result.errors).toEqual([]);
  });

  it('fails on an expired entry, also when no advisory matches it', () => {
    const expired = allowlist(entry('GHSA-high', '2026-10-21'), entry('GHSA-gone', '2026-10-01'));
    const result = evaluate(audit(advisory('GHSA-high', 'high')), expired, NOW);
    expect(result.errors).toEqual([
      'audit-allowlist.json: the entry GHSA-high expired on 2026-10-21. Fix the advisory or renew the entry with a new reason.',
      'audit-allowlist.json: the entry GHSA-gone expired on 2026-10-01. Fix the advisory or renew the entry with a new reason.',
      'high advisory GHSA-high in pkg is not in audit-allowlist.json: GHSA-high title'
    ]);
  });

  it('fails on an entry without an id, a reason or a real expiry date', () => {
    const broken = allowlist(
      entry('', '2026-12-01'),
      entry('GHSA-x', '2026-12-01', ' '),
      entry('GHSA-y', '2026-02-30'),
      entry('GHSA-z', 'next month')
    );
    const result = evaluate(audit(), broken, NOW);
    expect(result.errors).toEqual([
      'audit-allowlist.json: entry 1 needs an id, a reason and an expires date (YYYY-MM-DD).',
      'audit-allowlist.json: entry 2 needs an id, a reason and an expires date (YYYY-MM-DD).',
      'audit-allowlist.json: entry 3 needs an id, a reason and an expires date (YYYY-MM-DD).',
      'audit-allowlist.json: entry 4 needs an id, a reason and an expires date (YYYY-MM-DD).'
    ]);
  });

  it('fails when the allowlist file has no advisories list', () => {
    expect(evaluate(audit(), {}, NOW).errors).toEqual([
      'audit-allowlist.json must be an object with an "advisories" list.'
    ]);
  });

  it('reports an entry that matches no advisory, without failing', () => {
    const result = evaluate(audit(), allowlist(entry('GHSA-old', '2026-12-01')), NOW);
    expect(result).toEqual({
      errors: [],
      notes: ['audit-allowlist.json: the entry GHSA-old matches no advisory. Remove it.']
    });
  });

  it.each([
    ['text that is not JSON', { status: 1, stdout: 'ERR_PNPM_FETCH', stderr: 'boom' }],
    ['an empty output', { status: 1, stdout: '', stderr: '' }],
    [
      'the error object of an unreachable registry',
      { status: 1, stdout: '{"error":{"code":"pnpm","message":"fetch failed"}}', stderr: '' }
    ],
    ['a report without advisories', { status: 0, stdout: '{"metadata":{}}', stderr: '' }],
    [
      'a failed run that lists no advisory',
      { status: 1, stdout: '{"advisories":{},"metadata":{}}', stderr: '' }
    ],
    ['a run that did not start', { status: null, stdout: '', stderr: '' }]
  ])('fails closed on %s', (_name, run) => {
    const result = evaluate(run, allowlist(), NOW);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/^pnpm audit gave no usable report/);
  });
});

describe('workflow error command', () => {
  // Registry text reaches the log. A line break in it must not start a new workflow command.
  it('escapes %, carriage returns and line breaks of registry text', () => {
    const hostile = {
      ...advisory('GHSA-evil', 'high'),
      module_name: 'pkg%0A',
      title: 'bad\r\n::warning::x'
    };
    const [error] = evaluate(audit(hostile), allowlist(), NOW).errors;
    const command = errorCommand(error);
    expect(command.split(/\r|\n/)).toHaveLength(1);
    expect(command).toBe(
      '::error::high advisory GHSA-evil in pkg%250A is not in audit-allowlist.json: bad%0D%0A::warning::x'
    );
  });

  it('keeps plain text as it is', () => {
    expect(errorCommand('high advisory GHSA-a in pkg: a title')).toBe(
      '::error::high advisory GHSA-a in pkg: a title'
    );
  });
});

describe('audit-gate.js command', () => {
  // Returns a local port that nothing listens on.
  async function closedPort() {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    await new Promise((resolve) => server.close(resolve));
    return port;
  }

  it('exits 1 when the registry does not answer', async () => {
    // pnpm 11 reads its settings from pnpm_config_* variables.
    const env = {
      ...process.env,
      pnpm_config_registry: `http://127.0.0.1:${await closedPort()}/`,
      pnpm_config_fetch_retries: '0'
    };
    const run = spawnSync(process.execPath, [script], { encoding: 'utf8', env, timeout: 60_000 });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('pnpm audit gave no usable report');
    expect(run.stderr).toContain('fetch failed');
  });
});
