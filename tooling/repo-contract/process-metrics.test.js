// Pins the process metrics (issue #121).
// The fixture holds merged PRs in the shape of the GitHub GraphQL API.
// The tests use a fixed `now`, so the window of weeks never moves.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  computeMetrics,
  isoWeekOf,
  parseArgs,
  percentile,
  renderMarkdown
} from './process-metrics.js';

const pullRequests = JSON.parse(
  readFileSync(new URL('./fixtures/merged-pull-requests.json', import.meta.url), 'utf8')
);

// A Thursday inside 2026-W43.
const now = new Date('2026-10-22T12:00:00Z');
const options = { repository: 'team/app', base: 'main', weeks: 3, now };

describe('process metrics', () => {
  const report = computeMetrics(pullRequests, options);

  it('lists the requested ISO weeks up to the week of now, oldest first', () => {
    expect(report.weeks.map((week) => [week.week, week.start, week.inProgress])).toEqual([
      ['2026-W41', '2026-10-05', false],
      ['2026-W42', '2026-10-12', false],
      ['2026-W43', '2026-10-19', true]
    ]);
  });

  it('counts the PRs merged into the base branch in each week', () => {
    // PR 100 goes to another base branch. PR 97 merged before the window.
    expect(report.weeks.map((week) => week.mergedPrs)).toEqual([0, 2, 4]);
    expect(report.total.mergedPrs).toBe(6);
  });

  it('counts a PR without a closing issue of the repository, and gives it no lead time', () => {
    // PR 103 closes nothing, like a `[sin-issue]` PR. PR 99 closes an issue of another repository.
    expect(report.weeks.map((week) => week.prsWithoutIssue)).toEqual([0, 1, 1]);
    expect(report.total.prsWithoutIssue).toBe(2);
  });

  it('measures each issue once, from its creation to the first merged PR that closes it', () => {
    const samples = report.weeks.flatMap((week) => week.samples);
    expect(samples).toEqual([
      { issue: 5, pr: 98, days: 10 },
      { issue: 10, pr: 101, days: 2 },
      { issue: 11, pr: 102, days: 1 },
      { issue: 12, pr: 102, days: 4 }
    ]);
    expect(report.weeks.map((week) => week.issuesClosed)).toEqual([0, 1, 3]);
  });

  it('gives the median and the p85 of the lead time per week and in total', () => {
    expect(report.weeks.map((week) => week.leadTimeDays)).toEqual([
      { median: null, p85: null },
      { median: 10, p85: 10 },
      { median: 2, p85: 3.4 }
    ]);
    expect(report.total).toMatchObject({ issuesClosed: 4, leadTimeDays: { median: 3, p85: 7.3 } });
  });

  it('records the repository, the base branch and now', () => {
    expect(report).toMatchObject({
      repository: 'team/app',
      base: 'main',
      generatedAt: '2026-10-22T12:00:00.000Z'
    });
  });

  it('renders one Markdown row per week and one total row', () => {
    expect(renderMarkdown(report)).toBe(
      [
        '## Process metrics',
        '',
        'team/app, PRs merged into `main`, 3 ISO weeks up to 2026-10-22 (UTC).',
        'Lead time: days from the creation of an issue to the merge of the first PR that closes it.',
        '',
        '| Week | Merged PRs | PRs without issue | Issues closed | Lead time median (days) | Lead time p85 (days) |',
        '| --- | ---: | ---: | ---: | ---: | ---: |',
        '| 2026-W41 | 0 | 0 | 0 | — | — |',
        '| 2026-W42 | 2 | 1 | 1 | 10.0 | 10.0 |',
        '| 2026-W43 (in progress) | 4 | 1 | 3 | 2.0 | 3.4 |',
        '| Total | 6 | 2 | 4 | 3.0 | 7.3 |',
        ''
      ].join('\n')
    );
  });
});

describe('ISO weeks', () => {
  it.each([
    ['2026-01-01T00:00:00Z', '2026-W01', '2025-12-29'],
    ['2027-01-01T00:00:00Z', '2026-W53', '2026-12-28'],
    ['2024-12-30T00:00:00Z', '2025-W01', '2024-12-30'],
    ['2026-10-25T23:59:59Z', '2026-W43', '2026-10-19'],
    ['2026-10-26T00:00:00Z', '2026-W44', '2026-10-26']
  ])('puts %s in %s, which starts on %s', (date, week, start) => {
    expect(isoWeekOf(new Date(date))).toEqual({ week, start });
  });
});

describe('percentile', () => {
  it('interpolates between the closest ranks, and gives null for no values', () => {
    expect(percentile([4, 1, 2], 0.5)).toBe(2);
    expect(percentile([1, 2, 4, 10], 0.5)).toBe(3);
    expect(percentile([1, 2, 4, 10], 0.85)).toBeCloseTo(7.3, 10);
    expect(percentile([7], 0.85)).toBe(7);
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe('command-line arguments', () => {
  it('reads the repository, the weeks, the base branch and the JSON path', () => {
    expect(
      parseArgs(['--repo', 'team/app', '--weeks', '8', '--base', 'trunk', '--json', 'out.json'], {})
    ).toEqual({ repository: 'team/app', weeks: 8, base: 'trunk', json: 'out.json' });
  });

  it('takes the repository from GITHUB_REPOSITORY, 12 weeks and main by default', () => {
    expect(parseArgs([], { GITHUB_REPOSITORY: 'team/app' })).toEqual({
      repository: 'team/app',
      weeks: 12,
      base: 'main',
      json: null
    });
  });

  it.each([
    [[], 'Give --repo <owner>/<name> or set GITHUB_REPOSITORY.'],
    [['--repo', 'app'], 'Give --repo <owner>/<name> or set GITHUB_REPOSITORY.'],
    [['--repo', 'team/app', '--weeks', '0'], '--weeks must be a whole number from 1 to 104.'],
    [['--repo', 'team/app', '--weeks', 'x'], '--weeks must be a whole number from 1 to 104.'],
    [['--repo', 'team/app', '--color'], 'Unknown argument: --color']
  ])('rejects %j', (argv, message) => {
    expect(() => parseArgs(argv, {})).toThrow(message);
  });
});
