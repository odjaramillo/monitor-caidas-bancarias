// Reads GitHub Actions workflow files as raw text, without a YAML parser.
// The reader knows only the shape that this repository uses:
// two-space indentation, a top-level `jobs:` key and list items under `steps:`.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// The required status checks of `main`. Keep this list equal to the ruleset.
export const REQUIRED_JOBS = ['checks', 'docker', 'secrets', 'issue'];

const JOB = /^ {2}([A-Za-z0-9_-]+):\s*$/;
const JOB_KEY = /^ {4}([A-Za-z0-9_-]+):\s*(.*)$/;
const JOB_MAP_KEY = /^ {6}([A-Za-z0-9_-]+):\s*(.*)$/;
const STEP_START = /^ {6}- (.*)$/;
const STEP_KEY = /^ {8}([A-Za-z0-9_-]+):\s*(.*)$/;
const KEY_VALUE = /^([A-Za-z0-9_-]+):\s*(.*)$/;

// Setup actions prepare the runner. They do not check the code.
const SETUP_ACTION =
  /^(actions\/(checkout|setup-[\w-]+|cache)|pnpm\/action-setup|docker\/setup-[\w-]+)@/;

// A run step that only prints or exits with success checks nothing.
const NO_OP_LINE = /^(echo\b.*|exit 0|true|:)$/;

function stripComment(value) {
  return value.replace(/\s+#.*$/, '').trim();
}

function indentOf(line) {
  return line.length - line.trimStart().length;
}

function setStepKey(step, key, rawValue) {
  const value = key === 'run' ? rawValue.trim() : stripComment(rawValue);
  if (key === 'run' && /^[|>][-+]?$/.test(value)) {
    step.run = '';
    return true;
  }
  step[key] = value;
  return false;
}

function closeRunBlock(state) {
  if (!state.inRunBlock) return;
  state.step.run = state.step.run.trim();
  state.inRunBlock = false;
}

// A block scalar continues while its lines are blank or indented deeper than the step keys.
function continueRunBlock(state, line) {
  if (line.trim() === '' || indentOf(line) > 8) {
    state.step.run += (state.step.run ? '\n' : '') + line.trim();
    return true;
  }
  closeRunBlock(state);
  return false;
}

function readJobStart(state, line) {
  const match = JOB.exec(line);
  if (!match) return false;
  state.job = {
    id: match[1],
    name: null,
    needs: null,
    if: null,
    continueOnError: false,
    concurrency: null,
    steps: []
  };
  state.jobs.push(state.job);
  state.inSteps = false;
  state.inConcurrency = false;
  return true;
}

function readJobKey(state, line) {
  const match = JOB_KEY.exec(line);
  if (!match) return false;
  const [, key, rawValue] = match;
  const value = stripComment(rawValue);
  state.inSteps = key === 'steps';
  state.inConcurrency = key === 'concurrency' && value === '';
  if (key === 'concurrency') state.job.concurrency = value === '' ? {} : value;
  if (key === 'name') state.job.name = value.replace(/^['"]|['"]$/g, '');
  if (key === 'continue-on-error') state.job.continueOnError = value === 'true';
  if (key === 'needs' || key === 'if') state.job[key] = value;
  return true;
}

function readStepLine(state, line) {
  const start = STEP_START.exec(line);
  if (start) {
    state.step = {};
    state.job.steps.push(state.step);
  }
  const pair = start ? KEY_VALUE.exec(start[1]) : state.step && STEP_KEY.exec(line);
  if (pair) state.inRunBlock = setStepKey(state.step, pair[1], pair[2]);
}

function readLine(state, line) {
  if (state.inRunBlock && continueRunBlock(state, line)) return;
  if (/^\S/.test(line)) {
    state.inJobs = /^jobs:\s*$/.test(line);
    state.job = null;
    return;
  }
  if (!state.inJobs || readJobStart(state, line) || !state.job) return;
  if (readJobKey(state, line)) return;
  if (state.inSteps) readStepLine(state, line);
  if (state.inConcurrency) readConcurrencyLine(state, line);
}

function readConcurrencyLine(state, line) {
  const pair = JOB_MAP_KEY.exec(line);
  if (pair) state.job.concurrency[pair[1]] = stripComment(pair[2]);
}

/**
 * Returns the jobs of one workflow file in file order.
 * Each job has its id, its `name:` (or null), its raw `needs:` and `if:` values (or null) and its steps.
 * Its `concurrency` is a map of its raw values, the raw value of a one-line form, or null.
 * Each step keeps its raw `name`, `uses`, `run`, `if` and `continue-on-error` values.
 */
export function parseJobs(text) {
  const state = {
    jobs: [],
    inJobs: false,
    job: null,
    inSteps: false,
    step: null,
    inRunBlock: false,
    inConcurrency: false
  };
  for (const line of text.split('\n')) readLine(state, line);
  closeRunBlock(state);
  return state.jobs;
}

/**
 * Returns the raw values of a top-level map, such as the workflow `concurrency:`.
 * Returns null when the key is missing. The reader keeps only the keys two spaces deep.
 */
export function topLevelMap(text, key) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => stripComment(line) === `${key}:`);
  if (start < 0) return null;
  const map = {};
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const pair = /^ {2}([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (pair) map[pair[1]] = stripComment(pair[2]);
  }
  return map;
}

/** Returns the status-check context of a job: its `name:`, or its id when it has no name. */
export function contextOf(job) {
  return job.name ?? job.id;
}

/** Returns true when the step can fail the job on a broken change. */
export function isCheckStep(job, step) {
  if (job.continueOnError || step['continue-on-error'] === 'true') return false;
  if (step.if === 'false') return false;
  if (step.uses) return !SETUP_ACTION.test(step.uses);
  if (step.run === undefined) return false;
  const lines = step.run
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
  return lines.some((line) => !NO_OP_LINE.test(line));
}

/** Returns the ids of the jobs that have no check step. */
export function noOpJobs(jobs) {
  return jobs.filter((job) => !job.steps.some((step) => isCheckStep(job, step))).map((j) => j.id);
}

/** Returns the jobs of every workflow file in a directory. Each job also has its `file`. */
export function readWorkflows(dir) {
  return readdirSync(dir)
    .filter((file) => /\.ya?ml$/.test(file))
    .flatMap((file) =>
      parseJobs(readFileSync(join(dir, file), 'utf8')).map((job) => ({ file, ...job }))
    );
}

/** Returns the job whose status-check context is `context`, or undefined. */
export function jobByContext(jobs, context) {
  return jobs.find((job) => contextOf(job) === context);
}
