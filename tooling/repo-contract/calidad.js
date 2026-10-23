// Reads the tables of docs/calidad.md and the rule markers of the README.
// The reader knows only the shape that these files use:
// one table per section, cells between `|` borders, and one `<!-- regla: ... -->` marker per rule.

const HEADING = /^#{1,6} /;
const SEPARATOR = /^\|[\s|:-]+\|$/;
const BACKTICKED = /`([^`]+)`/g;
const MARKER = /<!-- regla: (.+?) -->/g;
const NUMBERED_ITEM = /^\d+\. /;
const JOB_NAME = /^[a-z][a-z0-9_-]*$/;

// pnpm runs these commands itself. They are not scripts of a package.json.
const PNPM_COMMANDS = new Set(['audit', 'exec', 'install']);

// Only these columns name controls. The other columns describe the rule and the failure.
const CONTROL_COLUMNS = ['Control', 'Dónde corre'];

/** Returns the lines under the heading, up to the next heading of any level. */
export function sectionLines(text, heading) {
  const lines = text.split('\n');
  const start = lines.findIndex(
    (line) => HEADING.test(line) && line.replace(HEADING, '').trim() === heading
  );
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => HEADING.test(line));
  return end < 0 ? rest : rest.slice(0, end);
}

function cellsOf(line) {
  return line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
}

/** Returns the rows of the first table in the lines. Each row maps a header to its cell. */
export function parseTable(lines) {
  const [header, ...body] = lines.filter((line) => line.startsWith('|'));
  if (header === undefined) return [];
  const keys = cellsOf(header);
  return body
    .filter((line) => !SEPARATOR.test(line))
    .map((line) => Object.fromEntries(cellsOf(line).map((cell, i) => [keys[i], cell])));
}

function isPath(token) {
  if (/\s/.test(token) || token.startsWith('/')) return false;
  return token.includes('/') || /\.[a-z]+$/.test(token);
}

/**
 * Returns the reference that one backticked token makes, or null for plain text.
 * `pnpm <name>` names a script. A token with `/` or a file extension names a path or an Action.
 * A bare name in the "Dónde corre" column names a CI job.
 */
export function referenceOf(token, column) {
  if (token.startsWith('pnpm ')) return { kind: 'script', name: token.split(/\s+/)[1] };
  if (isPath(token)) return { kind: 'path', name: token };
  if (column === 'Dónde corre' && JOB_NAME.test(token)) return { kind: 'job', name: token };
  return null;
}

/** Returns the references of the control columns of one row. */
export function rowReferences(row) {
  return CONTROL_COLUMNS.flatMap((column) =>
    [...(row[column] ?? '').matchAll(BACKTICKED)]
      .map((match) => referenceOf(match[1], column))
      .filter((reference) => reference !== null)
  );
}

/**
 * Returns true when the repository has the reference.
 * `repo` gives `hasPath(path)`, and the sets `scripts`, `jobs` and `actions`.
 */
export function referenceExists(reference, repo) {
  if (reference.kind === 'script') {
    return PNPM_COMMANDS.has(reference.name) || repo.scripts.has(reference.name);
  }
  if (reference.kind === 'job') return repo.jobs.has(reference.name);
  return repo.hasPath(reference.name) || repo.actions.has(reference.name);
}

/** Splits the lines into rules: each numbered item and each paragraph is one rule. */
export function ruleBlocks(lines) {
  const blocks = [];
  let current = [];
  for (const line of lines) {
    if ((line.trim() === '' || NUMBERED_ITEM.test(line)) && current.length > 0) {
      blocks.push(current.join('\n'));
      current = [];
    }
    if (line.trim() !== '') current.push(line);
  }
  if (current.length > 0) blocks.push(current.join('\n'));
  return blocks;
}

/** Returns the row names of the `<!-- regla: ... -->` markers in the text. */
export function markersOf(text) {
  return [...text.matchAll(MARKER)].map((match) => match[1].trim());
}
