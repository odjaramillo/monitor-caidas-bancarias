import pg from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { Db } from './db.js';
import { TEST_DATABASE_URL } from './testing/database.js';

const valid = { origin: 'banesco', destination: 'mercantil', type: 'sale_no_llega' };

// A fake database that answers every query with the same result or error.
function fakeDb(result: () => Promise<unknown>): Db {
  return { query: result } as unknown as Db;
}

function pgError(code: string, message = 'database error') {
  return Object.assign(new Error(message), { code });
}

async function post(db: Db, payload: unknown) {
  const app = buildApp({ db, getStatus: () => undefined }, { logger: false });
  const res = await app.inject({ method: 'POST', url: '/reports', payload: payload as object });
  await app.close();
  return res;
}

describe('POST /reports validation', () => {
  // Validation runs before the handler, so the database must never be called.
  const untouched = fakeDb(() => Promise.reject(new Error('the database should not be called')));

  it.each([
    ['an unknown failure type', { ...valid, type: 'se_cayo' }, /body\/type/],
    ['a missing origin', { destination: 'mercantil', type: 'no_sale' }, /origin/],
    ['a missing destination', { origin: 'banesco', type: 'no_sale' }, /destination/],
    ['a missing type', { origin: 'banesco', destination: 'mercantil' }, /type/],
    ['an extra field', { ...valid, comment: 'hola' }, /additional properties/],
    ['an empty bank id', { ...valid, origin: '' }, /body\/origin/],
    ['a bank id that is not text', { ...valid, destination: 42 }, /body\/destination/]
  ])('rejects %s with 400', async (_case, payload, message) => {
    const res = await post(untouched, payload);

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ statusCode: 400, error: 'Bad Request' });
    expect(res.json().message).toMatch(message);
  });

  it('rejects a body that is not JSON with 400', async () => {
    const app = buildApp({ db: untouched, getStatus: () => undefined }, { logger: false });
    const res = await app.inject({
      method: 'POST',
      url: '/reports',
      headers: { 'content-type': 'application/json' },
      payload: '{not json'
    });
    await app.close();

    expect(res.statusCode).toBe(400);
  });
});

describe('POST /reports database errors', () => {
  it('turns a foreign key violation (unknown bank) into 400', async () => {
    const res = await post(
      fakeDb(() => Promise.reject(pgError('23503'))),
      { ...valid, origin: 'banco_falso' }
    );

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Unknown bank in origin or destination'
    });
  });

  it.each([
    ['the connection is refused', pgError('ECONNREFUSED')],
    ['PostgreSQL drops the connection', pgError('08006')],
    ['the pool times out', new Error('timeout exceeded when trying to connect')]
  ])('answers 503 when %s', async (_case, error) => {
    const res = await post(
      fakeDb(() => Promise.reject(error)),
      valid
    );

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ statusCode: 503, error: 'Service Unavailable' });
  });

  it('answers 500 for any other database error', async () => {
    const res = await post(
      fakeDb(() => Promise.reject(pgError('42P01', 'relation "reports" does not exist'))),
      valid
    );

    expect(res.statusCode).toBe(500);
  });
});

// Against the real schema from the migrations of #4: the foreign key does the bank check.
describe('POST /reports with PostgreSQL', () => {
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  let client: pg.PoolClient;
  let app: ReturnType<typeof buildApp>;

  // Each test runs inside a transaction that is rolled back, so the test leaves nothing behind.
  beforeEach(async () => {
    client = await pool.connect();
    await client.query('begin');
    app = buildApp({ db: autocommit(client), getStatus: () => undefined }, { logger: false });
    await app.ready();
  });
  afterEach(async () => {
    try {
      await app.close();
      await client.query('rollback');
    } finally {
      client.release();
    }
  });
  afterAll(() => pool.end());

  it('saves a valid report and answers 201 with it', async () => {
    const before = Date.now();

    const res = await app.inject({ method: 'POST', url: '/reports', payload: valid });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toEqual({ id: expect.any(Number), ...valid, createdAt: expect.any(String) });
    expect(Date.parse(body.createdAt)).toBeGreaterThanOrEqual(before - 1_000);

    const { rows } = await client.query(
      'select origin, destination, type from reports where id = $1',
      [body.id]
    );
    expect(rows).toEqual([valid]);
  });

  it('accepts a report from a bank to itself', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/reports',
      payload: { origin: 'banesco', destination: 'banesco', type: 'no_sale' }
    });

    expect(res.statusCode).toBe(201);
  });

  it('answers 400 for a bank that does not exist and saves nothing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/reports',
      payload: { ...valid, destination: 'banco_falso' }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('Unknown bank in origin or destination');
    const { rows } = await client.query(
      "select count(*)::int as n from reports where destination = 'banco_falso'"
    );
    expect(rows[0].n).toBe(0);
  });
});

// Runs each query of the app in its own savepoint, as autocommit does outside a transaction.
// A failed insert then undoes only itself, and the test transaction stays usable.
function autocommit(client: pg.PoolClient): Db {
  return {
    query: async (...args: Parameters<pg.PoolClient['query']>) => {
      await client.query('savepoint app_query');
      try {
        const result = await client.query(...args);
        await client.query('release savepoint app_query');
        return result;
      } catch (err) {
        await client.query('rollback to savepoint app_query');
        throw err;
      }
    }
  } as unknown as Db;
}
