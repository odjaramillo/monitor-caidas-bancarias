import type { InjectOptions } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { Db } from './db.js';

// The CORS rules in docs/api.md: only the origin in CORS_ORIGIN, and the preflight before POST /reports.
const frontend = 'https://mcb.vercel.app';
const db = { query: () => Promise.resolve({ rows: [] }) } as unknown as Db;

describe('CORS', () => {
  let previous: string | undefined;
  beforeEach(() => {
    previous = process.env.CORS_ORIGIN;
    process.env.CORS_ORIGIN = frontend;
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = previous;
  });

  async function inject(opts: InjectOptions) {
    const app = buildApp({ db }, { logger: false });
    const res = await app.inject(opts);
    await app.close();
    return res;
  }

  it('answers the preflight before POST /reports with 204', async () => {
    const res = await inject({
      method: 'OPTIONS',
      url: '/reports',
      headers: {
        origin: frontend,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type'
      }
    });

    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(frontend);
    expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
  });

  it('allows the frontend origin on GET routes', async () => {
    const res = await inject({ method: 'GET', url: '/health', headers: { origin: frontend } });

    expect(res.headers['access-control-allow-origin']).toBe(frontend);
  });

  it('never allows any other origin, so the browser blocks it', async () => {
    const res = await inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://otro-sitio.example' }
    });

    // The header always names the frontend; it does not match, so the browser drops the response.
    expect(res.headers['access-control-allow-origin']).toBe(frontend);
  });
});
