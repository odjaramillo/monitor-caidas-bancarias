import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { createPool, type Db } from './db.js';
import { TEST_DATABASE_URL } from './testing/database.js';

describe('GET /health', () => {
  it('answers 200 when the database responds', async () => {
    const pool = createPool({ databaseUrl: TEST_DATABASE_URL, dbPoolMax: 1 });
    const app = buildApp({ db: pool }, { logger: false });
    afterAll(async () => {
      await app.close();
      await pool.end();
    });

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', database: 'ok' });
  });

  it('answers 503 when the database does not respond', async () => {
    const brokenDb: Db = {
      query: () => Promise.reject(new Error('connection refused'))
    } as unknown as Db;
    const app = buildApp({ db: brokenDb }, { logger: false });
    afterAll(() => app.close());

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'error', database: 'unreachable' });
  });
});
