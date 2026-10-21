import pg from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TEST_DATABASE_URL } from './testing/database.js';

// The same banks and failure types as docs/api.md (issue #15).
const MVP_BANKS = [
  { id: 'bancamiga', name: 'Bancamiga' },
  { id: 'bancaribe', name: 'Bancaribe' },
  { id: 'banesco', name: 'Banesco' },
  { id: 'bdt', name: 'Banco Digital de los Trabajadores' },
  { id: 'bnc', name: 'Banco Nacional de Crédito' },
  { id: 'exterior', name: 'Banco Exterior' },
  { id: 'mercantil', name: 'Mercantil' },
  { id: 'plaza', name: 'Banco Plaza' },
  { id: 'provincial', name: 'BBVA Provincial' },
  { id: 'venezuela', name: 'Banco de Venezuela' }
];
const FAILURE_TYPES = ['no_sale', 'sale_no_llega', 'error_app', 'punto_de_venta'];

// PostgreSQL error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';
const NOT_NULL_VIOLATION = '23502';

describe('database schema', () => {
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  let client: pg.PoolClient;

  // Each test runs inside a transaction that is rolled back, so no test leaves reports behind.
  beforeEach(async () => {
    client = await pool.connect();
    await client.query('begin');
  });
  afterEach(async () => {
    await client.query('rollback');
    client.release();
  });
  afterAll(() => pool.end());

  function insertReport(origin: string, destination: string, type: string | null) {
    return client.query<{ id: string; created_at: Date }>(
      'insert into reports (origin, destination, type) values ($1, $2, $3) returning id, created_at',
      [origin, destination, type]
    );
  }

  it('seeds the ten MVP banks with the ids of the API contract', async () => {
    const { rows } = await client.query('select id, name from banks order by id');

    expect(rows).toEqual(MVP_BANKS);
  });

  it.each(FAILURE_TYPES)(
    'stores a report of type %s with an id and the time it arrived',
    async (type) => {
      const before = new Date();

      const { rows } = await insertReport('banesco', 'mercantil', type);

      expect(rows[0].id).toMatch(/^\d+$/);
      expect(rows[0].created_at.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1_000);
    }
  );

  it('accepts a report from a bank to itself', async () => {
    await expect(insertReport('banesco', 'banesco', 'sale_no_llega')).resolves.toBeDefined();
  });

  it('rejects a report with an unknown origin bank', async () => {
    await expect(insertReport('nope', 'mercantil', 'no_sale')).rejects.toMatchObject({
      code: FOREIGN_KEY_VIOLATION
    });
  });

  it('rejects a report with an unknown destination bank', async () => {
    await expect(insertReport('banesco', 'nope', 'no_sale')).rejects.toMatchObject({
      code: FOREIGN_KEY_VIOLATION
    });
  });

  it('rejects a failure type outside the closed list', async () => {
    await expect(insertReport('banesco', 'mercantil', 'otro')).rejects.toMatchObject({
      code: CHECK_VIOLATION
    });
  });

  it('rejects a report without a failure type', async () => {
    await expect(insertReport('banesco', 'mercantil', null)).rejects.toMatchObject({
      code: NOT_NULL_VIOLATION
    });
  });

  it('stores created_at with its time zone', async () => {
    const { rows } = await client.query<{ data_type: string }>(
      `select data_type from information_schema.columns
       where table_name = 'reports' and column_name = 'created_at'`
    );

    expect(rows).toEqual([{ data_type: 'timestamp with time zone' }]);
  });

  // The worker (#6, #21) counts the reports of the last 15 minutes on every pass.
  it('indexes reports by created_at', async () => {
    const { rows } = await client.query<{ indexdef: string }>(
      `select indexdef from pg_indexes where tablename = 'reports'`
    );

    expect(rows.some((row) => /\(created_at\)/.test(row.indexdef))).toBe(true);
  });
});
