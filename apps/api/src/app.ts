import cors from '@fastify/cors';
import Fastify, { type FastifyServerOptions } from 'fastify';
import type { Db } from './db.js';

export interface AppDeps {
  db: Db;
}

// buildApp creates the server without listening, so tests can call app.inject().
// The database arrives as a dependency: tests pass the local database or a fake one.
export function buildApp(deps: AppDeps, opts: FastifyServerOptions = {}) {
  const app = Fastify(opts);

  app.register(cors, { origin: process.env.CORS_ORIGIN ?? false });

  // The uptime monitor and the post-deploy check call this route (docs/api.md).
  app.get('/health', async (req, reply) => {
    try {
      await deps.db.query('select 1');
      return { status: 'ok', database: 'ok' };
    } catch (err) {
      req.log.error({ err }, 'database health check failed');
      return reply.code(503).send({ status: 'error', database: 'unreachable' });
    }
  });

  return app;
}
