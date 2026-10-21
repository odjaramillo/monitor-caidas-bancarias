import { describe, expect, it } from 'vitest';
import { testDatabaseUrl } from './database.js';

const COMPOSE_URL = 'postgresql://mcb:mcb@localhost:5432/mcb';

describe('testDatabaseUrl', () => {
  it('uses the compose.yaml database when DATABASE_URL is not set', () => {
    expect(testDatabaseUrl({})).toBe(COMPOSE_URL);
  });

  it('uses a local DATABASE_URL, like the service container in CI', () => {
    const url = 'postgresql://mcb:mcb@127.0.0.1:5433/other';
    expect(testDatabaseUrl({ DATABASE_URL: url })).toBe(url);
  });

  it.each([
    'postgresql://user:hunter2@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
    // pg connects to the host query parameter, not to the host before the path.
    'postgresql://mcb:hunter2@localhost:5432/mcb?host=db.example.com',
    'postgresql://user:hunter2@[bad/mcb'
  ])('refuses %s without printing it', (url) => {
    expect(() => testDatabaseUrl({ DATABASE_URL: url })).toThrow(
      /^The tests only run against a local database\. Unset DATABASE_URL/
    );
    expect(() => testDatabaseUrl({ DATABASE_URL: url })).not.toThrow(/hunter2/);
  });
});
