import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// The test lints source text with the repository config, as `pnpm lint` does (issue #115).
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const eslint = new ESLint({ cwd: repoRoot });

async function restrictedImports(code: string, file: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: `${repoRoot}apps/api/src/${file}` });
  return result.messages
    .filter((message) => message.ruleId === 'no-restricted-imports')
    .map((message) => message.message);
}

describe('import boundary of levels.ts', () => {
  it.each([
    "import pg from 'pg';",
    "import Fastify from 'fastify';",
    "import cors from '@fastify/cors';",
    "import { runner } from 'node-pg-migrate';",
    "import { buildApp } from './app.js';",
    "import { loadConfig } from './config.js';",
    "import type { Db } from './db.js';",
    "import { openDemoPool } from './demo-seed.js';",
    "import { reportRoutes } from './reports.js';",
    "import './seed-demo.js';",
    "import './server.js';",
    "import { createServer } from './start.js';",
    "import { createStatusWorker } from './status-worker.js';",
    "import { TEST_DATABASE_URL } from './testing/database.js';"
  ])('rejects %s', async (code) => {
    const errors = await restrictedImports(`${code}\nexport {};\n`, 'levels.ts');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('levels.ts holds pure domain logic');
  });

  it('accepts pure code', async () => {
    const code = 'export function double(n: number): number {\n  return n * 2;\n}\n';
    expect(await restrictedImports(code, 'levels.ts')).toEqual([]);
  });

  it('does not restrict the other API modules', async () => {
    expect(await restrictedImports("import pg from 'pg';\nexport {};\n", 'db.ts')).toEqual([]);
  });
});
