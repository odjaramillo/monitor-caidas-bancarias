// Finds skipped tests in the source text of a test file (issue #118).
// A skip is accepted only with the tag `// skip: #<issue> until <YYYY-MM-DD>`.
// The tag is a comment line just above the skip, where Prettier keeps it, or ends the skip line.
// The skip expires at the end of that day, in UTC.

const SKIP_CALL = /\b(?:it|test|describe|suite|bench)(?:\.\w+)*\.(?:skip|skipIf|runIf|fixme)\b/;
const SKIP_TAG = /\/\/ skip: #(\d+) until (\S+)\s*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const COMMENT_LINE = /^\s*\/\//;

const UNTAGGED = 'skip without the tag `// skip: #<issue> until <YYYY-MM-DD>`';

function isRealDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function tagProblem(lines, today) {
  const tag = lines.map((line) => SKIP_TAG.exec(line)).find((match) => match !== null);
  if (!tag || !ISO_DATE.test(tag[2])) return UNTAGGED;
  const [, issue, expiry] = tag;
  if (!isRealDate(expiry)) return `skip tag with a date that does not exist: ${expiry}`;
  return expiry < today ? `skip of #${issue} expired on ${expiry}` : null;
}

/**
 * Returns one violation per skipped test that has no valid tag, or whose tag expired before `now`.
 * Each violation has its 1-based `line` and its `reason`.
 */
export function skipViolations(text, now) {
  const today = now.toISOString().slice(0, 10);
  const lines = text.split('\n');
  return lines.flatMap((line, index) => {
    if (!SKIP_CALL.test(line)) return [];
    const above = lines[index - 1] ?? '';
    const reason = tagProblem([line, COMMENT_LINE.test(above) ? above : ''], today);
    return reason ? [{ line: index + 1, reason }] : [];
  });
}
