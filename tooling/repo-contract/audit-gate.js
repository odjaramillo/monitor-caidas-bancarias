// Fails on high or critical advisories of the production dependencies (issue #117).
// It runs `pnpm audit --prod --json` and fails closed: no usable report means failure.
// An accepted advisory needs an entry in audit-allowlist.json with an id, a reason and an expiry date.
// An expired entry fails, so somebody must look at the advisory again.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ALLOWLIST = 'audit-allowlist.json';
const BLOCKING = new Set(['high', 'critical']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function isText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isValidEntry(entry) {
  return isText(entry?.id) && isText(entry?.reason) && isRealDate(entry?.expires);
}

function parseJson(text) {
  try {
    return JSON.parse(text ?? '');
  } catch {
    return undefined;
  }
}

// Returns the report, or a string that says why the run gave no usable report.
function readReport(run) {
  const report = parseJson(run.stdout);
  if (report === undefined) {
    return `the output is not JSON (exit ${run.status}): ${run.stdout}${run.stderr}`.trim();
  }
  if (report?.error) return `pnpm failed: ${report.error.message ?? JSON.stringify(report.error)}`;
  if (typeof report?.advisories !== 'object' || report.advisories === null) {
    return 'the report has no advisories object';
  }
  // pnpm exits 1 only when it lists advisories. Any other failure has no usable report.
  if (run.status !== 0 && Object.keys(report.advisories).length === 0) {
    return `pnpm exited ${run.status} and listed no advisory`;
  }
  return report;
}

// Returns the errors of the allowlist entries: a broken entry or an expired entry.
function allowlistErrors(entries, today) {
  return entries.flatMap((entry, i) => {
    if (!isValidEntry(entry)) {
      return [
        `${ALLOWLIST}: entry ${i + 1} needs an id, a reason and an expires date (YYYY-MM-DD).`
      ];
    }
    if (entry.expires >= today) return [];
    return [
      `${ALLOWLIST}: the entry ${entry.id} expired on ${entry.expires}. Fix the advisory or renew the entry with a new reason.`
    ];
  });
}

/**
 * Checks one `pnpm audit --prod --json` run against the allowlist.
 * `run` has the `status`, `stdout` and `stderr` of the run. `now` is the current date.
 * An entry is valid up to the end of its `expires` day, in UTC.
 * Returns the errors that fail the gate and the notes that only inform.
 */
export function evaluate(run, allowlist, now) {
  if (!Array.isArray(allowlist?.advisories)) {
    return { errors: [`${ALLOWLIST} must be an object with an "advisories" list.`], notes: [] };
  }
  const report = readReport(run);
  if (typeof report === 'string') {
    return { errors: [`pnpm audit gave no usable report: ${report}`], notes: [] };
  }
  const today = now.toISOString().slice(0, 10);
  const entries = allowlist.advisories;
  const allowed = new Set(
    entries.filter((e) => isValidEntry(e) && e.expires >= today).map((e) => e.id)
  );
  const advisories = Object.values(report.advisories);
  const blocking = advisories
    .filter((a) => BLOCKING.has(a.severity) && !allowed.has(a.github_advisory_id))
    .map(
      (a) =>
        `${a.severity} advisory ${a.github_advisory_id} in ${a.module_name} is not in ${ALLOWLIST}: ${a.title}`
    );
  const found = new Set(advisories.map((a) => a.github_advisory_id));
  const notes = entries
    .filter((e) => isValidEntry(e) && !found.has(e.id))
    .map((e) => `${ALLOWLIST}: the entry ${e.id} matches no advisory. Remove it.`);
  return { errors: [...allowlistErrors(entries, today), ...blocking], notes };
}

/**
 * Formats one gate error as a GitHub workflow `::error::` command on one line.
 * The message holds registry text, such as advisory titles and module names.
 * The escape follows the GitHub rule for command data: `%` first, then `\r` and `\n`.
 * So a line break in registry text cannot start a new workflow command.
 */
export function errorCommand(message) {
  const escaped = message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  return `::error::${escaped}`;
}

function readAllowlist(root) {
  try {
    return JSON.parse(readFileSync(join(root, ALLOWLIST), 'utf8'));
  } catch (error) {
    return { error: `${ALLOWLIST} cannot be read: ${error.message}` };
  }
}

function main() {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const allowlist = readAllowlist(root);
  if (allowlist.error) {
    console.error(allowlist.error);
    return 1;
  }
  const run = spawnSync('pnpm', ['audit', '--prod', '--json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  const { errors, notes } = evaluate(run, allowlist, new Date());
  for (const note of notes) console.log(note);
  for (const error of errors) console.error(errorCommand(error));
  if (errors.length > 0) return 1;
  console.log('pnpm audit: no high or critical advisory outside audit-allowlist.json.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
