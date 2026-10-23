import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import { createPool, type Db } from './db.js';
import type { Status } from './levels.js';
import { TEST_DATABASE_URL } from './testing/database.js';

describe('GET /health', () => {
  it('answers 200 when the database responds', async () => {
    const pool = createPool({ databaseUrl: TEST_DATABASE_URL, dbPoolMax: 1 });
    const app = buildApp({ db: pool, getStatus: () => undefined }, { logger: false });
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
    const app = buildApp({ db: brokenDb, getStatus: () => undefined }, { logger: false });
    afterAll(() => app.close());

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'error', database: 'unreachable' });
  });
});

describe('GET /health with the deployed commit', () => {
  // These tests only check the response shape, so a fake database that always answers is enough.
  const healthyDb: Db = { query: () => Promise.resolve({ rows: [] }) } as unknown as Db;
  const brokenDb: Db = {
    query: () => Promise.reject(new Error('connection refused'))
  } as unknown as Db;

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('adds the commit that Render deployed, so the post-deploy check can tell the new deploy apart', async () => {
    vi.stubEnv('RENDER_GIT_COMMIT', '7c10c71a2b3c4d5e6f708192a3b4c5d6e7f80912');
    const app = buildApp({ db: healthyDb, getStatus: () => undefined }, { logger: false });
    afterAll(() => app.close());

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: 'ok',
      database: 'ok',
      commit: '7c10c71a2b3c4d5e6f708192a3b4c5d6e7f80912'
    });
  });

  it.each([undefined, '', '  '])(
    'keeps exactly the existing fields when RENDER_GIT_COMMIT is %j',
    async (value) => {
      vi.stubEnv('RENDER_GIT_COMMIT', value);
      const app = buildApp({ db: healthyDb, getStatus: () => undefined }, { logger: false });
      afterAll(() => app.close());

      const res = await app.inject({ method: 'GET', url: '/health' });

      expect(res.statusCode).toBe(200);
      expect(res.body).toBe('{"status":"ok","database":"ok"}');
    }
  );

  it('keeps the 503 answer unchanged when the database does not respond', async () => {
    vi.stubEnv('RENDER_GIT_COMMIT', '7c10c71a2b3c4d5e6f708192a3b4c5d6e7f80912');
    const app = buildApp({ db: brokenDb, getStatus: () => undefined }, { logger: false });
    afterAll(() => app.close());

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(503);
    expect(res.body).toBe('{"status":"error","database":"unreachable"}');
  });
});

describe('GET /status', () => {
  // The route must answer from memory: a database that fails on any query proves it.
  const untouchableDb: Db = {
    query: () => Promise.reject(new Error('GET /status must not query the database'))
  } as unknown as Db;

  const status: Status = {
    updatedAt: '2026-10-28T14:05:30.000Z',
    windowMinutes: 15,
    pairs: [
      {
        origin: 'banesco',
        destination: 'mercantil',
        level: 'muchos_reportes',
        reports: 12,
        message:
          '12 personas reportan problemas con pagos de Banesco a Mercantil en los últimos 15 minutos'
      }
    ]
  };

  it('answers 200 with the last computed status', async () => {
    const app = buildApp({ db: untouchableDb, getStatus: () => status }, { logger: false });
    afterAll(() => app.close());

    const res = await app.inject({ method: 'GET', url: '/status' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(status);
  });

  it('answers 503 before the first pass finishes', async () => {
    const app = buildApp({ db: untouchableDb, getStatus: () => undefined }, { logger: false });
    afterAll(() => app.close());

    const res = await app.inject({ method: 'GET', url: '/status' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'Status has not been computed yet'
    });
  });

  it('serves the newest status on every call', async () => {
    const latest: { current?: Status } = {};
    const app = buildApp({ db: untouchableDb, getStatus: () => latest.current }, { logger: false });
    afterAll(() => app.close());

    const before = await app.inject({ method: 'GET', url: '/status' });
    latest.current = status;
    const after = await app.inject({ method: 'GET', url: '/status' });

    expect([before.statusCode, after.statusCode]).toEqual([503, 200]);
  });
});
