import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import { TEST_DATABASE_URL } from './database.js';

// Vitest runs this once before all tests: the test database gets the same schema as production.
export default async function setup() {
  await runner({
    databaseUrl: TEST_DATABASE_URL,
    dir: fileURLToPath(new URL('../../migrations', import.meta.url)),
    direction: 'up',
    migrationsTable: 'pgmigrations',
    // Same pattern as the migrate script in package.json: skip dotfiles and the README.
    ignorePattern: String.raw`(\..*|.*\.md)`,
    log: () => {}
  });
}
