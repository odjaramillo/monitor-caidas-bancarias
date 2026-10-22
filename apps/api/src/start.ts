import type { FastifyServerOptions } from 'fastify';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { createStatusWorker, type WorkerLog } from './status-worker.js';

// createServer wires the real dependencies from the environment. server.ts only listens.
// It throws ConfigError before opening any connection when a required variable is missing.
export function createServer(env: NodeJS.ProcessEnv, opts: FastifyServerOptions = {}) {
  const config = loadConfig(env);
  const pool = createPool(config);
  // The worker needs the app logger, and the app needs the worker's snapshot: the log is read lazily.
  const log: WorkerLog = { error: (obj, msg) => app.log.error(obj, msg) };
  const worker = createStatusWorker({ db: pool, intervalMs: config.statusIntervalMs, log });
  const app = buildApp({ db: pool, getStatus: worker.getStatus }, opts);

  // An idle connection can drop (for example, when Supabase restarts). Log it instead of crashing.
  pool.on('error', (err) => app.log.error({ err }, 'idle database connection failed'));
  // Start with the server, not at import time, so building the app in a test stays quiet.
  app.addHook('onReady', async () => worker.start());
  // app.close() runs this hook, so SIGTERM stops the interval first and then closes the pool.
  app.addHook('onClose', async () => {
    await worker.stop();
    await pool.end();
  });

  return { app, pool, worker };
}
