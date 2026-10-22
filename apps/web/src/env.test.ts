import { describe, expect, it } from 'vitest';
import { variables } from './env.js';

describe('environment variables', () => {
  it('sends PUBLIC_API_URL to the browser, fixed at build time', () => {
    expect(variables.PUBLIC_API_URL.public).toBe(true);
    expect(variables.PUBLIC_API_URL.static).toBe(true);
  });
});
