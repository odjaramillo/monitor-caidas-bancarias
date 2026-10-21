import { isLocalDatabaseUrl } from '../database-url.js';

const COMPOSE_DATABASE_URL = 'postgresql://mcb:mcb@localhost:5432/mcb';

// The tests migrate the database and write to it, so a DATABASE_URL exported for the Supabase
// pooler (to run migrate or seed:demo) must not reach them. The error never prints the URL,
// because it can carry the password.
export function testDatabaseUrl(env: NodeJS.ProcessEnv): string {
  const databaseUrl = env.DATABASE_URL ?? COMPOSE_DATABASE_URL;
  if (!isLocalDatabaseUrl(databaseUrl)) {
    throw new Error(
      'The tests only run against a local database. Unset DATABASE_URL to use the one in ' +
        'compose.yaml, or point it at localhost.'
    );
  }
  return databaseUrl;
}

// Tests run against a real PostgreSQL: the one in compose.yaml locally, a service container in CI.
export const TEST_DATABASE_URL = testDatabaseUrl(process.env);
