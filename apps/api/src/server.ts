import { ConfigError } from './config.js';
import { createServer } from './start.js';

let server: ReturnType<typeof createServer>;
try {
  server = createServer(process.env, { logger: { level: process.env.LOG_LEVEL ?? 'info' } });
} catch (err) {
  if (!(err instanceof ConfigError)) throw err;
  // No logger exists yet: print the reason and stop before listening.
  console.error(`The API cannot start: ${err.message}`);
  process.exit(1);
}
const { app } = server;

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
