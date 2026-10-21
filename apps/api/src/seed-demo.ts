import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { openDemoPool, seedDemoCommand } from './demo-seed.js';

// Entry point of `pnpm --filter api seed:demo` (issue #12). The logic and its tests live in demo-seed.ts.
const rl = createInterface({ input: stdin, output: stdout });
try {
  process.exitCode = await seedDemoCommand(process.env, {
    createDb: openDemoPool,
    ask: rl.question.bind(rl),
    log: console.log,
    error: console.error
  });
} finally {
  rl.close();
}
