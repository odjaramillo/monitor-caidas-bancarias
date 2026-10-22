import { PUBLIC_API_URL } from '$app/env/public';
import { createReportForm } from '#lib/report.js';
import type { PageLoad } from './$types';

// The form needs nothing from the API to show, so the build saves it complete for the CDN.
// It is on screen before the JavaScript arrives, which helps with a weak signal (R7).
export const load: PageLoad = () => ({ form: createReportForm(PUBLIC_API_URL) });
