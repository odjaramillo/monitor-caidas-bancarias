// Computes process metrics from the tracker (issue #121).
// For each ISO week it counts the PRs merged into the base branch and the lead time of the issues they close.
// The functions take the tracker data and `now`, so the tests need no network.
// The command line reads the data with `gh api graphql`. The query only reads: it has no mutation.
//
// A PR links to an issue through its closing references (`closingIssuesReferences`).
// GitHub fills them from `Closes #N` in the body and from the links set by hand.
// A PR without a closing issue of this repository, like a `[sin-issue]` or a Dependabot PR,
// counts as a merged PR and gives no lead time.

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const USAGE = 'Give --repo <owner>/<name> or set GITHUB_REPOSITORY.';
const WEEKS_ERROR = '--weeks must be a whole number from 1 to 104.';

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

// Returns 00:00 UTC of the Monday of the week of the date.
function mondayOf(date) {
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const sinceMonday = (date.getUTCDay() + 6) % 7;
  return new Date(day - sinceMonday * DAY_MS);
}

/** Returns the ISO 8601 week of a date in UTC, as `YYYY-Www`, and the date of its Monday. */
export function isoWeekOf(date) {
  const monday = mondayOf(date);
  // The Thursday of a week decides the year of the week.
  const thursday = new Date(monday.getTime() + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const firstThursday = mondayOf(new Date(Date.UTC(year, 0, 4))).getTime() + 3 * DAY_MS;
  const week = 1 + Math.round((thursday.getTime() - firstThursday) / WEEK_MS);
  return { week: `${year}-W${String(week).padStart(2, '0')}`, start: dateOnly(monday) };
}

/**
 * Returns the percentile `p` (0 to 1) of the values, or null when there are none.
 * It interpolates linearly between the two closest ranks.
 */
export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (sorted.length - 1) * p;
  const low = Math.floor(rank);
  const high = Math.min(low + 1, sorted.length - 1);
  return sorted[low] + (rank - low) * (sorted[high] - sorted[low]);
}

function round(value) {
  return value === null ? null : Math.round(value * 100) / 100;
}

function leadTimeOf(days) {
  return { median: round(percentile(days, 0.5)), p85: round(percentile(days, 0.85)) };
}

function closingIssues(pr, repository) {
  const own = repository.toLowerCase();
  return (pr.closingIssuesReferences?.nodes ?? []).filter(
    (issue) => issue.repository?.nameWithOwner?.toLowerCase() === own
  );
}

// Returns, for each issue, the first merged PR that closes it and the lead time in days.
function firstClosures(pullRequests, repository) {
  const byIssue = new Map();
  const oldestFirst = [...pullRequests].sort((a, b) => a.mergedAt.localeCompare(b.mergedAt));
  for (const pr of oldestFirst) {
    for (const issue of closingIssues(pr, repository)) {
      if (byIssue.has(issue.number)) continue;
      const days = (Date.parse(pr.mergedAt) - Date.parse(issue.createdAt)) / DAY_MS;
      byIssue.set(issue.number, { issue: issue.number, pr: pr.number, days: round(days) });
    }
  }
  return byIssue;
}

function emptyWeeks(now, count) {
  const current = mondayOf(now).getTime();
  return Array.from({ length: count }, (_, i) => {
    const monday = new Date(current - (count - 1 - i) * WEEK_MS);
    return {
      ...isoWeekOf(monday),
      inProgress: i === count - 1,
      mergedPrs: 0,
      prsWithoutIssue: 0,
      samples: []
    };
  });
}

function summarize(row) {
  const days = row.samples.map((sample) => sample.days);
  return { ...row, issuesClosed: row.samples.length, leadTimeDays: leadTimeOf(days) };
}

/**
 * Computes the metrics of the PRs merged into `base` in the last `weeks` ISO weeks up to `now`.
 * `pullRequests` holds merged PRs with `number`, `mergedAt`, `baseRefName` and `closingIssuesReferences`.
 * The current week is in the window, and `inProgress` marks it.
 */
export function computeMetrics(pullRequests, { repository, base, weeks, now }) {
  const merged = pullRequests.filter((pr) => pr.mergedAt && pr.baseRefName === base);
  const closures = firstClosures(merged, repository);
  const rows = emptyWeeks(now, weeks);
  const byWeek = new Map(rows.map((row) => [row.week, row]));
  for (const pr of merged) {
    const row = byWeek.get(isoWeekOf(new Date(pr.mergedAt)).week);
    if (!row) continue;
    row.mergedPrs += 1;
    if (closingIssues(pr, repository).length === 0) row.prsWithoutIssue += 1;
    row.samples.push(...[...closures.values()].filter((closure) => closure.pr === pr.number));
  }
  for (const row of rows) row.samples.sort((a, b) => a.issue - b.issue);
  const weekRows = rows.map(summarize);
  const allDays = weekRows.flatMap((row) => row.samples.map((sample) => sample.days));
  const total = {
    mergedPrs: weekRows.reduce((sum, row) => sum + row.mergedPrs, 0),
    prsWithoutIssue: weekRows.reduce((sum, row) => sum + row.prsWithoutIssue, 0),
    issuesClosed: allDays.length,
    leadTimeDays: leadTimeOf(allDays)
  };
  return { repository, base, generatedAt: now.toISOString(), weeks: weekRows, total };
}

function days(value) {
  return value === null ? '—' : value.toFixed(1);
}

function tableRow(label, row) {
  const cells = [label, row.mergedPrs, row.prsWithoutIssue, row.issuesClosed];
  cells.push(days(row.leadTimeDays.median), days(row.leadTimeDays.p85));
  return `| ${cells.join(' | ')} |`;
}

/** Renders the report as a Markdown table for the job summary. */
export function renderMarkdown(report) {
  const weekRows = report.weeks.map((row) =>
    tableRow(row.inProgress ? `${row.week} (in progress)` : row.week, row)
  );
  return [
    '## Process metrics',
    '',
    `${report.repository}, PRs merged into \`${report.base}\`, ${report.weeks.length} ISO weeks up to ${report.generatedAt.slice(0, 10)} (UTC).`,
    'Lead time: days from the creation of an issue to the merge of the first PR that closes it.',
    '',
    '| Week | Merged PRs | PRs without issue | Issues closed | Lead time median (days) | Lead time p85 (days) |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...weekRows,
    tableRow('Total', report.total),
    ''
  ].join('\n');
}

const FLAGS = { '--repo': 'repository', '--weeks': 'weeks', '--base': 'base', '--json': 'json' };

function checkArgs(args) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(args.repository ?? '')) throw new Error(USAGE);
  const weeks = Number(args.weeks);
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 104) throw new Error(WEEKS_ERROR);
  return { ...args, weeks };
}

/** Reads the command-line arguments. `env` gives GITHUB_REPOSITORY when `--repo` is missing. */
export function parseArgs(argv, env) {
  const args = { repository: env.GITHUB_REPOSITORY, weeks: '12', base: 'main', json: null };
  for (let i = 0; i < argv.length; i += 2) {
    const key = FLAGS[argv[i]];
    if (!key) throw new Error(`Unknown argument: ${argv[i]}`);
    args[key] = argv[i + 1];
  }
  return checkArgs(args);
}

const QUERY = `query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: MERGED, first: 100, after: $cursor, orderBy: {field: UPDATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        mergedAt
        updatedAt
        baseRefName
        closingIssuesReferences(first: 25) {
          nodes { number createdAt repository { nameWithOwner } }
        }
      }
    }
  }
}`;

function fetchPage(repository, cursor) {
  const [owner, name] = repository.split('/');
  const args = ['api', 'graphql', '-f', `query=${QUERY}`, '-f', `owner=${owner}`];
  args.push('-f', `name=${name}`);
  if (cursor) args.push('-f', `cursor=${cursor}`);
  const run = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`gh api graphql failed: ${run.stderr || run.error}`);
  return JSON.parse(run.stdout).data.repository.pullRequests;
}

// Reads every merged PR. The first closing PR of an issue can be older than the window.
function fetchMergedPullRequests(repository) {
  const pullRequests = [];
  let cursor = null;
  do {
    const page = fetchPage(repository, cursor);
    pullRequests.push(...page.nodes);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return pullRequests;
}

function main() {
  const args = parseArgs(process.argv.slice(2), process.env);
  const report = computeMetrics(fetchMergedPullRequests(args.repository), {
    ...args,
    now: new Date()
  });
  if (args.json) writeFileSync(args.json, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(renderMarkdown(report));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
