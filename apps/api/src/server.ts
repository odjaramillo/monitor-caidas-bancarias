import { buildApp } from './app.js';

const app = buildApp({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

const port = Number(process.env.PORT ?? 3000);
// Inside a container, 0.0.0.0 is required so traffic from outside the container reaches the server.
const host = process.env.HOST ?? '0.0.0.0';

// Render sends SIGTERM before it stops the container.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
