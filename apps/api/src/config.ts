// Supabase's free plan allows at most 15 connections through its pooler (issue #20).
export const MAX_DB_POOL_SIZE = 15;
export const DEFAULT_DB_POOL_SIZE = 10;

// How often the worker recalculates the status. The frontend flags a status older than 3 minutes
// (#26), so 30 s leaves room for several failed passes before the screen warns.
export const DEFAULT_STATUS_INTERVAL_MS = 30_000;
const MIN_STATUS_INTERVAL_MS = 1_000;
const MAX_STATUS_INTERVAL_MS = 3_600_000;

export interface Config {
  databaseUrl: string;
  dbPoolMax: number;
  statusIntervalMs: number;
}

// Thrown when the environment is missing a value the API cannot start without.
export class ConfigError extends Error {
  override name = 'ConfigError';
}

// loadConfig reads the environment once at startup, so a missing value stops the API before it listens.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new ConfigError(
      'DATABASE_URL is not set. Copy .env.example to .env for local development, or set it in the Render service.'
    );
  }

  return {
    databaseUrl,
    dbPoolMax: parsePoolSize(env.DB_POOL_MAX),
    statusIntervalMs: parseStatusInterval(env.STATUS_INTERVAL_MS)
  };
}

function parseStatusInterval(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_STATUS_INTERVAL_MS;

  const ms = Number(raw);
  if (!Number.isInteger(ms) || ms < MIN_STATUS_INTERVAL_MS || ms > MAX_STATUS_INTERVAL_MS) {
    throw new ConfigError(
      `STATUS_INTERVAL_MS must be a whole number of milliseconds from ${MIN_STATUS_INTERVAL_MS} to ${MAX_STATUS_INTERVAL_MS}, got "${raw}".`
    );
  }
  return ms;
}

function parsePoolSize(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_DB_POOL_SIZE;

  const size = Number(raw);
  if (!Number.isInteger(size) || size < 1 || size > MAX_DB_POOL_SIZE) {
    throw new ConfigError(
      `DB_POOL_MAX must be a whole number from 1 to ${MAX_DB_POOL_SIZE} (Supabase limit), got "${raw}".`
    );
  }
  return size;
}
