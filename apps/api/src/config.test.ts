import { describe, expect, it } from 'vitest';
import { ConfigError, DEFAULT_DB_POOL_SIZE, loadConfig } from './config.js';

const url = 'postgresql://mcb:mcb@localhost:5432/mcb';

describe('loadConfig', () => {
  it('reads DATABASE_URL and uses the default pool size', () => {
    expect(loadConfig({ DATABASE_URL: url })).toEqual({
      databaseUrl: url,
      dbPoolMax: DEFAULT_DB_POOL_SIZE
    });
  });

  it('reads the pool size from DB_POOL_MAX', () => {
    expect(loadConfig({ DATABASE_URL: url, DB_POOL_MAX: '5' }).dbPoolMax).toBe(5);
  });

  it.each([undefined, '', '   '])('refuses to start when DATABASE_URL is %j', (value) => {
    expect(() => loadConfig({ DATABASE_URL: value })).toThrow(ConfigError);
    expect(() => loadConfig({ DATABASE_URL: value })).toThrow(/DATABASE_URL is not set/);
  });

  it.each(['0', '16', '2.5', 'ten', '-1'])('rejects DB_POOL_MAX=%s', (value) => {
    expect(() => loadConfig({ DATABASE_URL: url, DB_POOL_MAX: value })).toThrow(
      /DB_POOL_MAX must be/
    );
  });

  it('accepts the Supabase limit of 15 connections', () => {
    expect(loadConfig({ DATABASE_URL: url, DB_POOL_MAX: '15' }).dbPoolMax).toBe(15);
  });
});
