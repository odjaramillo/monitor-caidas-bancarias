import { describe, expect, it } from 'vitest';
import { effectiveHost, isLocalDatabaseUrl } from './database-url.js';

const REMOTE_URL = 'postgresql://user:secret@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

describe('isLocalDatabaseUrl', () => {
  it.each([
    'postgresql://mcb:mcb@localhost:5432/mcb',
    'postgres://mcb:mcb@127.0.0.1:5432/mcb',
    'postgresql://mcb:mcb@[::1]:5432/mcb',
    'postgresql://mcb:mcb@localhost:5432/mcb?sslmode=disable'
  ])('accepts %s', (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(true);
  });

  it.each([
    REMOTE_URL,
    'postgresql://mcb:mcb@db.example.com/mcb',
    // pg connects to the host query parameter, not to the host before the path.
    'postgresql://mcb:mcb@localhost:5432/mcb?host=db.example.com',
    'postgresql://mcb:mcb@localhost:5432/mcb?hostaddr=203.0.113.5',
    'socket:/var/run/postgresql?db=mcb',
    'not a url',
    ''
  ])('rejects %s', (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(false);
  });
});

describe('effectiveHost', () => {
  it.each([
    [REMOTE_URL, 'aws-0-us-west-2.pooler.supabase.com'],
    ['postgresql://mcb:mcb@localhost:5432/mcb?host=db.example.com', 'db.example.com'],
    ['postgresql://mcb:mcb@[::1]:5432/mcb', '[::1]']
  ])('reads the host pg connects to from %s', (url, host) => {
    expect(effectiveHost(url)).toBe(host);
  });

  it.each(['not a url', 'postgresql://user:hunter2@[bad/mcb', ''])(
    'returns undefined for %s',
    (url) => {
      expect(effectiveHost(url)).toBeUndefined();
    }
  );
});
