// Reads Husky hook files as raw text.
// A hook step is a line that starts with `pnpm `. Comments, guards and assignments are not steps.

/** Returns the steps of one hook file in file order, without their indentation. */
export function hookSteps(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('pnpm '));
}
