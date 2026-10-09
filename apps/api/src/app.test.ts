import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

describe('GET /health', () => {
  const app = buildApp({ logger: false });
  afterAll(() => app.close());

  it('answers 200 with status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});
