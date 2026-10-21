// The tests (testing/database.ts) and the demo seed (demo-seed.ts) write to the database, so both
// use these functions to tell a local database from a remote one.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// pg copies every query parameter into its config, and a `host` parameter wins over the host
// before the path: `postgresql://localhost/mcb?host=db.example.com` connects to db.example.com.
const HOST_OVERRIDES = ['host', 'hostaddr'];

// effectiveHost returns the host pg connects to, or undefined when the URL cannot be read.
export function effectiveHost(databaseUrl: string): string | undefined {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return undefined;
  }
  return url.searchParams.get('host') || url.hostname || undefined;
}

// A URL is local only when its host is local and no query parameter can send pg somewhere else.
export function isLocalDatabaseUrl(databaseUrl: string): boolean {
  const host = effectiveHost(databaseUrl);
  if (host === undefined || !LOCAL_HOSTS.has(host)) return false;
  const { searchParams } = new URL(databaseUrl);
  return HOST_OVERRIDES.every((name) => !searchParams.has(name));
}
