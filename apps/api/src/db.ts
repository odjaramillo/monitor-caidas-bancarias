import pg from 'pg';
import type { Config } from './config.js';

// The routes only need query(), so tests can pass a fake that fails on purpose.
export type Db = Pick<pg.Pool, 'query'>;

// createPool opens connections lazily: nothing touches the database until the first query.
export function createPool(config: Pick<Config, 'databaseUrl' | 'dbPoolMax'>): pg.Pool {
  return new pg.Pool({
    connectionString: config.databaseUrl,
    max: config.dbPoolMax,
    // Fail fast instead of hanging a request when the database does not answer.
    connectionTimeoutMillis: 5_000,
    // Give idle connections back, so the API does not hold Supabase slots it is not using.
    idleTimeoutMillis: 30_000
  });
}
