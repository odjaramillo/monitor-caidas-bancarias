// The addresses the browser tests use. playwright.config.ts starts both servers on them.

// The static build calls the API at PUBLIC_API_URL, fixed at build time (src/env.ts).
// The tests read the same variable, so they start the API where the build looks for it.
export const API_URL = (process.env.PUBLIC_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

// vite preview serves the static build here.
export const WEB_URL = 'http://localhost:4173';
