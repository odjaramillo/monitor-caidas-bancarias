import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { localDatabaseUrl } from './database-url.js';

const SECRET = 'not-a-real-password';

// Returns the error that the call throws, or fails the test.
function thrown(call: () => unknown): unknown {
  try {
    call();
  } catch (error) {
    return error;
  }
  throw new Error('The call did not throw.');
}

describe('DATABASE_URL guard of the browser tests', () => {
  it('accepts a PostgreSQL on localhost or 127.0.0.1', () => {
    for (const url of [
      'postgresql://mcb:mcb@localhost:5432/mcb',
      'postgresql://mcb:mcb@127.0.0.1:5432/mcb'
    ]) {
      expect(localDatabaseUrl(url)).toBe(url);
    }
  });

  it.each([
    ['a missing value', undefined],
    ['an empty value', ''],
    ['a remote host', `postgresql://mcb:${SECRET}@db.example.com:5432/mcb`]
  ])('refuses %s', (_name, value) => {
    expect(() => localDatabaseUrl(value)).toThrow(
      new Error('The browser tests need DATABASE_URL set to a PostgreSQL on localhost.')
    );
  });

  // Node prints the properties and the cause of an error. None of them may hold the value.
  it('refuses a malformed value and never shows it', () => {
    const error = thrown(() => localDatabaseUrl(`postgresql://mcb:${SECRET}@[bad`));
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'DATABASE_URL is not a valid URL. The browser tests need a PostgreSQL on localhost.'
    );
    expect(inspect(error, { depth: Infinity })).not.toContain(SECRET);
  });
});
