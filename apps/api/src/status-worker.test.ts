import pg from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from './db.js';
import { createStatusWorker, type WorkerLog } from './status-worker.js';
import { TEST_DATABASE_URL } from './testing/database.js';

const NOW = new Date('2026-10-28T14:05:30.000Z');
const BANKS = [
  { id: 'banesco', name: 'Banesco' },
  { id: 'mercantil', name: 'Mercantil' }
];

interface HistoryRow {
  origin: string;
  destination: string;
  days: number;
  reports: number;
}

// A database that answers the three queries of a pass from memory and counts them.
function fakeDb(
  reportRows: { origin: string; destination: string; created_at: Date }[] = [],
  historyRows: HistoryRow[] = []
) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('from banks')) return { rows: BANKS };
    if (sql.includes('group by')) return { rows: historyRows };
    return { rows: reportRows };
  });
  return { db: { query } as unknown as Db, query };
}

function silentLog() {
  return { error: vi.fn<WorkerLog['error']>() };
}

describe('createStatusWorker', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('has no status before the first pass', () => {
    const worker = createStatusWorker({ db: fakeDb().db, intervalMs: 1000, log: silentLog() });

    expect(worker.getStatus()).toBeUndefined();
  });

  it('computes the status of every pair in one pass of three queries', async () => {
    const recent = new Date(NOW.getTime() - 60_000);
    const { db, query } = fakeDb([
      { origin: 'banesco', destination: 'mercantil', created_at: recent }
    ]);
    const worker = createStatusWorker({ db, intervalMs: 1000, log: silentLog() });

    await worker.runOnce();

    const status = worker.getStatus();
    expect(query).toHaveBeenCalledTimes(3);
    expect(status?.updatedAt).toBe(NOW.toISOString());
    expect(status?.pairs).toHaveLength(4);
    expect(status?.pairs[0]).toMatchObject({
      origin: 'banesco',
      destination: 'mercantil',
      level: 'posibles_problemas',
      reports: 1
    });
  });

  it('asks only for the reports inside the window', async () => {
    const { db, query } = fakeDb();
    const worker = createStatusWorker({ db, intervalMs: 1000, log: silentLog() });

    await worker.runOnce();

    const reportsCall = query.mock.calls.find(([sql]) => String(sql).includes('from reports'));
    const params = (reportsCall as unknown as [string, Date[]])[1];
    expect(params[0]).toEqual(new Date(NOW.getTime() - 15 * 60_000));
  });

  it('does not flag a pair that is busy at this hour, with one grouped history query', async () => {
    const recent = new Date(NOW.getTime() - 60_000);
    const { db, query } = fakeDb(
      Array.from({ length: 6 }, () => ({
        origin: 'banesco',
        destination: 'mercantil',
        created_at: recent
      })),
      [{ origin: 'banesco', destination: 'mercantil', days: 7, reports: 7 * 4 * 6 }]
    );
    const worker = createStatusWorker({ db, intervalMs: 1000, log: silentLog() });

    await worker.runOnce();

    expect(worker.getStatus()?.pairs[0]).toMatchObject({
      origin: 'banesco',
      destination: 'mercantil',
      level: 'normal',
      reports: 6
    });
    const historyCalls = query.mock.calls.filter(([sql]) => String(sql).includes('group by'));
    expect(historyCalls).toHaveLength(1);
  });

  it('falls back to the fixed thresholds when the history is too short', async () => {
    const recent = new Date(NOW.getTime() - 60_000);
    const { db } = fakeDb(
      Array.from({ length: 6 }, () => ({
        origin: 'banesco',
        destination: 'mercantil',
        created_at: recent
      })),
      [{ origin: 'banesco', destination: 'mercantil', days: 2, reports: 400 }]
    );
    const worker = createStatusWorker({ db, intervalMs: 1000, log: silentLog() });

    await worker.runOnce();

    expect(worker.getStatus()?.pairs[0]?.level).toBe('muchos_reportes');
  });

  it('asks for the history of the last 14 days, leaving out the current hour', async () => {
    const { db, query } = fakeDb();
    const worker = createStatusWorker({ db, intervalMs: 1000, log: silentLog() });

    await worker.runOnce();

    const historyCall = query.mock.calls.find(([sql]) => String(sql).includes('group by'));
    const sql = String(historyCall?.[0]);
    const params = (historyCall as unknown as [string, Date[]])[1];
    expect(sql).toContain("'America/Caracas'");
    expect(params).toEqual([
      new Date(NOW.getTime() - 14 * 24 * 3_600_000),
      new Date(NOW.getTime() - 3_600_000),
      NOW
    ]);
  });

  it('runs a pass at start and then once per interval', async () => {
    const { db, query } = fakeDb();
    const worker = createStatusWorker({ db, intervalMs: 1000, log: silentLog() });

    worker.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(query).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(1000);
    expect(query).toHaveBeenCalledTimes(6);
    await vi.advanceTimersByTimeAsync(1000);
    expect(query).toHaveBeenCalledTimes(9);

    await worker.stop();
  });

  it('logs a failed pass, keeps the last status and keeps the interval running', async () => {
    const { db, query } = fakeDb();
    const log = silentLog();
    const worker = createStatusWorker({ db, intervalMs: 1000, log });
    await worker.runOnce();
    const before = worker.getStatus();

    query.mockRejectedValueOnce(new Error('connection refused'));
    vi.setSystemTime(new Date(NOW.getTime() + 1000));
    await worker.runOnce();

    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.any(String)
    );
    expect(worker.getStatus()).toBe(before);

    worker.start();
    await vi.advanceTimersByTimeAsync(0);
    query.mockRejectedValue(new Error('still down'));
    await vi.advanceTimersByTimeAsync(1000);
    query.mockReset();
    query.mockImplementation(async (sql: string) =>
      sql.includes('from banks') ? { rows: BANKS } : { rows: [] }
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(worker.getStatus()?.updatedAt).toBe(new Date(NOW.getTime() + 3000).toISOString());
    await worker.stop();
  });

  it('does not start a pass while the previous one is still running', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const query = vi.fn(async (sql: string) => {
      await gate;
      return { rows: sql.includes('from banks') ? BANKS : [] };
    });
    const worker = createStatusWorker({
      db: { query } as unknown as Db,
      intervalMs: 1000,
      log: silentLog()
    });

    worker.start();
    await vi.advanceTimersByTimeAsync(3500);
    expect(query).toHaveBeenCalledTimes(3);

    release();
    await worker.stop();
  });

  it('stops the interval and waits for a pass in flight', async () => {
    const { db, query } = fakeDb();
    const worker = createStatusWorker({ db, intervalMs: 1000, log: silentLog() });
    worker.start();
    await vi.advanceTimersByTimeAsync(0);

    await worker.stop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(query).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores a second start', async () => {
    const { db, query } = fakeDb();
    const worker = createStatusWorker({ db, intervalMs: 1000, log: silentLog() });

    worker.start();
    worker.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(query).toHaveBeenCalledTimes(3);
    await worker.stop();
  });
});

describe('createStatusWorker against PostgreSQL', () => {
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  let client: pg.PoolClient;

  // The reports live inside a transaction that is rolled back, so the test leaves nothing behind.
  beforeEach(async () => {
    client = await pool.connect();
    await client.query('begin');
  });
  afterEach(async () => {
    await client.query('rollback');
    client.release();
  });
  afterAll(() => pool.end());

  it('counts the recent reports of the seeded banks and ignores the old ones', async () => {
    await client.query(
      `insert into reports (origin, destination, type, created_at) values
         ('banesco', 'mercantil', 'no_sale', now() - interval '1 minute'),
         ('banesco', 'mercantil', 'error_app', now() - interval '5 minutes'),
         ('banesco', 'mercantil', 'no_sale', now() - interval '20 minutes')`
    );
    const worker = createStatusWorker({
      db: client as unknown as Db,
      intervalMs: 1000,
      log: silentLog()
    });

    await worker.runOnce();

    const status = worker.getStatus();
    expect(status?.pairs).toHaveLength(100);
    expect(status?.pairs[0]).toMatchObject({
      origin: 'banesco',
      destination: 'mercantil',
      reports: 2,
      level: 'posibles_problemas'
    });
  });

  // Uses the real clock: the history is dated "n days ago" at this same time of day.
  async function insertHistory(origin: string, destination: string, days: number, perDay: number) {
    for (let day = 1; day <= days; day++) {
      await client.query(
        `insert into reports (origin, destination, type, created_at)
           select $1, $2, 'no_sale', now() - make_interval(days => $3::int)
           from generate_series(1, $4::int)`,
        [origin, destination, day, perDay]
      );
    }
  }

  async function insertRecent(origin: string, destination: string, count: number) {
    await client.query(
      `insert into reports (origin, destination, type, created_at)
         select $1, $2, 'no_sale', now() - interval '1 minute' from generate_series(1, $3::int)`,
      [origin, destination, count]
    );
  }

  async function firstPair() {
    const worker = createStatusWorker({
      db: client as unknown as Db,
      intervalMs: 1000,
      log: silentLog()
    });
    await worker.runOnce();
    return worker.getStatus()?.pairs[0];
  }

  it('does not flag a pair that is busy at this hour on every earlier day', async () => {
    await insertHistory('banesco', 'mercantil', 3, 24);
    await insertRecent('banesco', 'mercantil', 6);

    expect(await firstPair()).toMatchObject({ reports: 6, level: 'normal' });
  });

  it('flags a pair well above its baseline at this hour', async () => {
    await insertHistory('banesco', 'mercantil', 3, 4);
    await insertRecent('banesco', 'mercantil', 6);

    expect(await firstPair()).toMatchObject({ reports: 6, level: 'muchos_reportes' });
  });

  it('uses the fixed thresholds with fewer than three days of history', async () => {
    await insertHistory('banesco', 'mercantil', 2, 24);
    await insertRecent('banesco', 'mercantil', 6);

    expect(await firstPair()).toMatchObject({ reports: 6, level: 'muchos_reportes' });
  });
});
