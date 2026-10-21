import { afterAll, describe, expect, it } from 'vitest';
import { createPool } from './db.js';
import { TEST_DATABASE_URL } from './testing/database.js';

describe('createPool', () => {
  const pool = createPool({ databaseUrl: TEST_DATABASE_URL, dbPoolMax: 3 });
  afterAll(() => pool.end());

  it('runs queries against the local database', async () => {
    const { rows } = await pool.query<{ answer: number }>('select 1 as answer');

    expect(rows).toEqual([{ answer: 1 }]);
  });

  it('never opens more connections than the configured size', () => {
    expect(pool.options.max).toBe(3);
  });
});
