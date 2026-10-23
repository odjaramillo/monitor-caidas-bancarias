// The browser tests send reports, so they write to the database. A remote database is refused.
// The errors never print the URL, because it can carry the password.

const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

// A malformed URL makes `new URL` throw a TypeError that holds the raw value in `input`.
// So the parse returns undefined, and the caller throws its own message without a cause.
function hostnameOf(value: string): string | undefined {
  try {
    return new URL(value).hostname;
  } catch {
    return undefined;
  }
}

/** Returns DATABASE_URL when it names a PostgreSQL on localhost. Otherwise it throws. */
export function localDatabaseUrl(value: string | undefined): string {
  if (!value) {
    throw new Error('The browser tests need DATABASE_URL set to a PostgreSQL on localhost.');
  }
  const hostname = hostnameOf(value);
  if (hostname === undefined) {
    throw new Error(
      'DATABASE_URL is not a valid URL. The browser tests need a PostgreSQL on localhost.'
    );
  }
  if (!LOCAL_HOSTS.includes(hostname)) {
    throw new Error('The browser tests need DATABASE_URL set to a PostgreSQL on localhost.');
  }
  return value;
}
