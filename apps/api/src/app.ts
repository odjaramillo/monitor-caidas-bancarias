import cors from '@fastify/cors';
import Fastify, { type FastifyServerOptions } from 'fastify';
import type { Db } from './db.js';
import { reportRoutes } from './reports.js';

export interface AppDeps {
  db: Db;
}

// buildApp creates the server without listening, so tests can call app.inject().
// The database arrives as a dependency: tests pass the local database or a fake one.
export function buildApp(deps: AppDeps, opts: FastifyServerOptions = {}) {
  const app = Fastify({
    ...opts,
    // By default Fastify drops unknown fields and turns 42 into "42". The contract answers 400 instead
    // (docs/api.md), so the body is validated exactly as it arrives.
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } }
  });

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

  reportRoutes(app, deps.db);

  return app;
}
