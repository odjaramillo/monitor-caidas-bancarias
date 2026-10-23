// Checks the coverage ratchet (issue #120).
// Vitest fails when coverage falls below its floor. This check fails when coverage rises above
// its floor, so the PR that raises coverage also raises the floor.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PROJECTS,
  TOLERANCE,
  ratchetErrors,
  readFloors,
  run,
  writeFloors
} from './coverage-ratchet.js';

const script = fileURLToPath(new URL('./coverage-ratchet.js', import.meta.url));

function configText(floors, date = '2026-10-20') {
  return [
    "import { defineConfig } from 'vitest/config';",
    '',
    'export default defineConfig({',
    '  test: {',
    '    coverage: {',
    "      reporter: ['text-summary', 'json-summary'],",
    `      // Floor = coverage measured on ${date} at commit abc1234 (decision D16).`,
    '      // Raise these numbers when coverage rises. Never lower them to make CI green.',
    '      thresholds: {',
    `        statements: ${floors.statements},`,
    `        branches: ${floors.branches},`,
    `        functions: ${floors.functions},`,
    `        lines: ${floors.lines}`,
    '      }',
    '    }',
    '  }',
    '});',
    ''
  ].join('\n');
}

function summary(pct) {
  const metric = (value) => ({ total: 10, covered: 9, skipped: 0, pct: value });
  return {
    total: {
      statements: metric(pct.statements),
      branches: metric(pct.branches),
      functions: metric(pct.functions),
      lines: metric(pct.lines)
    }
  };
}

const FLOORS = { statements: 89.95, branches: 92.3, functions: 98.18, lines: 89.58 };

describe('coverage floors in a config', () => {
  it('reads the four floors and the date of their measurement', () => {
    expect(readFloors(configText(FLOORS))).toEqual({ date: '2026-10-20', floors: FLOORS });
  });

  it('refuses a floor without its dated comment, or a config without a floor', () => {
    const undated = configText(FLOORS).replace(/ {6}\/\/ Floor = .*\n/, '');
    expect(() => readFloors(undated)).toThrow('dated comment');
    expect(() => readFloors(configText(FLOORS).replace('thresholds', 'limits'))).toThrow(
      'no thresholds'
    );
    expect(() => readFloors(configText({ ...FLOORS, lines: 'x' }))).toThrow('lines');
  });

  it('writes new floors and today, and keeps the rest of the config', () => {
    const before = configText(FLOORS);
    const raised = { ...FLOORS, branches: 93.1, lines: 90 };
    const after = writeFloors(before, raised, '2026-10-22');
    expect(readFloors(after)).toEqual({ date: '2026-10-22', floors: raised });
    const changed = after.split('\n').filter((line, i) => line !== before.split('\n')[i]);
    expect(changed).toEqual([
      '      // Floor = coverage measured on 2026-10-22 by pnpm coverage:ratchet (decision D16).',
      '        branches: 93.1,',
      '        lines: 90'
    ]);
  });
});

describe('ratchet check', () => {
  it('passes coverage equal to the floor, or above it by the tolerance at most', () => {
    expect(TOLERANCE).toBe(0.1);
    expect(ratchetErrors('apps/api', FLOORS, summary(FLOORS))).toEqual([]);
    const within = { ...FLOORS, statements: 90.05 };
    expect(ratchetErrors('apps/api', FLOORS, summary(within))).toEqual([]);
  });

  it('leaves coverage under the floor to the Vitest thresholds', () => {
    const lower = { ...FLOORS, lines: 80 };
    expect(ratchetErrors('apps/api', FLOORS, summary(lower))).toEqual([]);
  });

  it('fails on each metric above its floor by more than the tolerance', () => {
    const higher = { ...FLOORS, statements: 90.06, functions: 100 };
    expect(ratchetErrors('apps/api', FLOORS, summary(higher))).toEqual([
      'apps/api: statements coverage 90.06% is above its floor 89.95% by more than 0.1. Run pnpm coverage:ratchet and commit the new floor.',
      'apps/api: functions coverage 100% is above its floor 98.18% by more than 0.1. Run pnpm coverage:ratchet and commit the new floor.'
    ]);
  });

  it('fails on a metric that the summary does not measure', () => {
    const broken = summary(FLOORS);
    broken.total.branches.pct = 'Unknown';
    delete broken.total.lines;
    expect(ratchetErrors('apps/api', FLOORS, broken)).toEqual([
      'apps/api: coverage-summary.json has no number for branches.',
      'apps/api: coverage-summary.json has no number for lines.'
    ]);
  });
});

describe('ratchet script', () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'coverage-ratchet-'));
    for (const { config } of PROJECTS) {
      mkdirSync(dirname(join(root, config)), { recursive: true });
      writeFileSync(join(root, config), configText(FLOORS));
    }
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeSummary(dir, pct) {
    mkdirSync(join(root, dir, 'coverage'), { recursive: true });
    writeFileSync(join(root, dir, 'coverage/coverage-summary.json'), JSON.stringify(summary(pct)));
  }

  function cli(...args) {
    return spawnSync(process.execPath, [script, '--root', root, ...args], { encoding: 'utf8' });
  }

  it('checks the API and the frontend', () => {
    expect(PROJECTS).toEqual([
      { dir: 'apps/api', config: 'apps/api/vitest.config.ts' },
      { dir: 'apps/web', config: 'apps/web/vite.config.ts' }
    ]);
  });

  it('exits 0 when every project sits on its floor', () => {
    for (const { dir } of PROJECTS) writeSummary(dir, FLOORS);
    const result = cli();
    expect([result.status, result.stderr]).toEqual([0, '']);
  });

  it('exits 1 and leaves the configs unchanged when coverage rose above a floor', () => {
    writeSummary('apps/api', { ...FLOORS, lines: 91 });
    writeSummary('apps/web', FLOORS);
    const result = cli();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('apps/api: lines coverage 91% is above its floor 89.58%');
    expect(readFileSync(join(root, 'apps/api/vitest.config.ts'), 'utf8')).toBe(configText(FLOORS));
  });

  it('fails closed when a project has no coverage summary', () => {
    writeSummary('apps/api', FLOORS);
    const result = cli();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'apps/web: apps/web/coverage/coverage-summary.json is missing. Run pnpm test first.'
    );
  });

  it('raises the floors with --write and never lowers them', () => {
    writeSummary('apps/api', { ...FLOORS, lines: 91, branches: 50 });
    writeSummary('apps/web', FLOORS);
    const written = run({ root, write: true, today: '2026-10-22' });
    expect(written.errors).toEqual([]);
    expect(written.changed).toEqual(['apps/api/vitest.config.ts']);
    const api = readFloors(readFileSync(join(root, 'apps/api/vitest.config.ts'), 'utf8'));
    expect(api).toEqual({ date: '2026-10-22', floors: { ...FLOORS, lines: 91 } });
    expect(readFileSync(join(root, 'apps/web/vite.config.ts'), 'utf8')).toBe(configText(FLOORS));
    expect(run({ root, write: false }).errors).toEqual([]);
  });

  it('writes no config with --write when one project fails', () => {
    writeSummary('apps/api', { ...FLOORS, lines: 91 });
    writeSummary('apps/web', FLOORS);
    const undated = configText(FLOORS).replace(/ {6}\/\/ Floor = .*\n/, '');
    writeFileSync(join(root, 'apps/web/vite.config.ts'), undated);
    const result = cli('--write');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('apps/web: The thresholds have no dated comment');
    expect(result.stdout).toBe('');
    expect(readFileSync(join(root, 'apps/api/vitest.config.ts'), 'utf8')).toBe(configText(FLOORS));
    expect(readFileSync(join(root, 'apps/web/vite.config.ts'), 'utf8')).toBe(undated);
  });
});
