import type { FastifyServerOptions } from 'fastify';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';

// createServer wires the real dependencies from the environment. server.ts only listens.
// It throws ConfigError before opening any connection when a required variable is missing.
export function createServer(env: NodeJS.ProcessEnv, opts: FastifyServerOptions = {}) {
  const config = loadConfig(env);
  const pool = createPool(config);
  const app = buildApp({ db: pool }, opts);

  // An idle connection can drop (for example, when Supabase restarts). Log it instead of crashing.
  pool.on('error', (err) => app.log.error({ err }, 'idle database connection failed'));
  // app.close() runs this hook, so SIGTERM also closes the database connections.
  app.addHook('onClose', async () => {
    await pool.end();
  });

  return { app, pool };
}
