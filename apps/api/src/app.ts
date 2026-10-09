import cors from '@fastify/cors';
import Fastify, { type FastifyServerOptions } from 'fastify';

// buildApp creates the server without listening, so tests can call app.inject().
export function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify(opts);

  app.register(cors, { origin: process.env.CORS_ORIGIN ?? false });

  // The uptime monitor and the post-deploy check call this route.
  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}
