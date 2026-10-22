import { PUBLIC_API_URL } from '$app/env/public';
import { createStatusScreen } from '#lib/status.js';
import type { PageLoad } from './$types';

// The build saves an empty page for the CDN. The browser asks GET /status when the page opens,
// so every visitor gets the same file and the latest status.
export const ssr = false;

// The load does not wait for the API. The page renders at once and asks for the status itself.
export const load: PageLoad = () => ({ screen: createStatusScreen(PUBLIC_API_URL) });
