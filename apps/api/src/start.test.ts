import { describe, expect, it, vi } from 'vitest';
import { ConfigError } from './config.js';
import { createServer } from './start.js';
import { TEST_DATABASE_URL } from './testing/database.js';

describe('createServer', () => {
  it('refuses to build the server without DATABASE_URL', () => {
    expect(() => createServer({})).toThrow(ConfigError);
  });

  it('answers /health with the database from the environment', async () => {
    const { app } = createServer(
      { DATABASE_URL: TEST_DATABASE_URL, DB_POOL_MAX: '2' },
      { logger: false }
    );

    const res = await app.inject({ method: 'GET', url: '/health' });
    await app.close();

    expect(res.json()).toEqual({ status: 'ok', database: 'ok' });
  });

  it('closes the database pool when the server closes', async () => {
    const { app, pool } = createServer({ DATABASE_URL: TEST_DATABASE_URL }, { logger: false });
    await app.ready();

    await app.close();

    expect(pool.ended).toBe(true);
  });

  it('logs an idle connection error instead of crashing', async () => {
    const { app, pool } = createServer({ DATABASE_URL: TEST_DATABASE_URL }, { logger: false });
    const logError = vi.spyOn(app.log, 'error');

    pool.emit('error', new Error('connection terminated'));
    await app.close();

    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.any(String)
    );
  });
});

describe('createServer status worker', () => {
  it('serves GET /status once the first pass finishes', async () => {
    const { app, worker } = createServer(
      { DATABASE_URL: TEST_DATABASE_URL, STATUS_INTERVAL_MS: '60000' },
      { logger: false }
    );
    await app.ready();
    await worker.runOnce();

    const res = await app.inject({ method: 'GET', url: '/status' });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().pairs).toHaveLength(100);
  });

  it('logs a failed pass with the app logger and keeps the server up', async () => {
    // Nothing listens on port 1, so every query of the pass is refused.
    const { app, worker } = createServer(
      { DATABASE_URL: 'postgres://user:pass@127.0.0.1:1/monitor' },
      { logger: false }
    );
    const logError = vi.spyOn(app.log, 'error');

    await app.ready();
    await worker.runOnce();
    const res = await app.inject({ method: 'GET', url: '/status' });
    await app.close();

    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.anything() }),
      'status pass failed'
    );
    expect(res.statusCode).toBe(503);
  });

  it('starts the worker when the server is ready and stops it when the server closes', async () => {
    const { app, worker } = createServer({ DATABASE_URL: TEST_DATABASE_URL }, { logger: false });
    const start = vi.spyOn(worker, 'start');
    const stop = vi.spyOn(worker, 'stop');

    await app.ready();
    expect(start).toHaveBeenCalledOnce();
    expect(stop).not.toHaveBeenCalled();

    await app.close();
    expect(stop).toHaveBeenCalledOnce();
  });
});
