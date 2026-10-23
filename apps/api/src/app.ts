import cors from '@fastify/cors';
import Fastify, { type FastifyServerOptions } from 'fastify';
import type { Db } from './db.js';
import type { Status } from './levels.js';
import { reportRoutes } from './reports.js';

export interface AppDeps {
  db: Db;
  // The last status the worker computed, or undefined before the first pass finishes.
  getStatus: () => Status | undefined;
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

  // Render sets RENDER_GIT_COMMIT to the deployed commit. The post-deploy check compares it (docs/api.md).
  // Outside Render the variable is not set, and /health answers without the field.
  const commit = process.env.RENDER_GIT_COMMIT?.trim() || undefined;

  // The uptime monitor and the post-deploy check call this route (docs/api.md).
  app.get('/health', async (req, reply) => {
    try {
      await deps.db.query('select 1');
      return commit ? { status: 'ok', database: 'ok', commit } : { status: 'ok', database: 'ok' };
    } catch (err) {
      req.log.error({ err }, 'database health check failed');
      return reply.code(503).send({ status: 'error', database: 'unreachable' });
    }
  });

  reportRoutes(app, deps.db);

  // Answers from memory and never queries the database (docs/api.md): the worker keeps it fresh.
  app.get('/status', async (_req, reply) => {
    const status = deps.getStatus();
    if (!status) {
      return reply.code(503).send({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Status has not been computed yet'
      });
    }
    return status;
  });

  return app;
}
