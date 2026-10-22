import { defineEnvVars } from '@sveltejs/kit/env';
import { apiBaseUrl } from '#lib/status.js';

export const variables = defineEnvVars({
  PUBLIC_API_URL: {
    // The browser calls the API, so the value goes into the client bundle.
    public: true,
    // Fixed at build time: on Vercel it is a build variable (#22).
    static: true,
    description: 'URL of the API (apps/api). Defaults to the local API.',
    schema: apiBaseUrl
  }
});
