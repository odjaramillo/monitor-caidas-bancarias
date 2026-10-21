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
