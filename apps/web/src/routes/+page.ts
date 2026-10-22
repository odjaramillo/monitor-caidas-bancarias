import { PUBLIC_API_URL } from '$app/env/public';
import { loadStatus } from '#lib/status.js';
import type { PageLoad } from './$types';

// The build saves an empty page for the CDN. The browser asks GET /status when the page opens,
// so every visitor gets the same file and the latest status.
export const ssr = false;

export const load: PageLoad = ({ fetch }) => loadStatus(fetch, PUBLIC_API_URL);
