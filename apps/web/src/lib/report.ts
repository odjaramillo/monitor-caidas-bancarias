import { writable, type Readable } from 'svelte/store';
import type { BankId, FailureType } from './banks.js';

// The body of POST /reports, as docs/api.md defines it.
export interface Report {
  origin: BankId;
  destination: BankId;
  type: FailureType;
}

export type ReportFormState =
  | { state: 'idle' }
  | { state: 'sending' }
  | { state: 'sent' }
  | { state: 'error'; message: string };

export const REPORT_MESSAGES = {
  sent: 'Gracias, recibimos tu reporte.',
  // 503: the database does not answer. The contract asks to try again in a few seconds.
  busy: 'No pudimos guardar tu reporte ahora. Intenta de nuevo en unos segundos.',
  // 400: the form only offers valid options, so the lists here are older than the API's.
  // Reloading the page brings the new lists.
  rejected: 'No pudimos guardar tu reporte. Recarga la página e intenta de nuevo.',
  // Network failure, timeout, CORS block or any other answer.
  error: 'No pudimos enviar tu reporte. Intenta de nuevo.'
};

// Same limit as the status screen: Render can take long to wake a sleeping API (R7).
const TIMEOUT_MS = 8000;

// The send button works only when the three answers are chosen and no report is on its way.
export function canSend(
  origin: string,
  destination: string,
  type: string,
  state: ReportFormState['state']
): boolean {
  return origin !== '' && destination !== '' && type !== '' && state !== 'sending';
}

// Never throws: the form always gets a state to show.
export async function sendReport(
  fetchFn: typeof fetch,
  apiUrl: string,
  report: Report,
  signal: AbortSignal = AbortSignal.timeout(TIMEOUT_MS)
): Promise<ReportFormState> {
  try {
    const response = await fetchFn(`${apiUrl}/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      signal
    });
    if (response.status === 201) return { state: 'sent' };
    if (response.status === 503) return { state: 'error', message: REPORT_MESSAGES.busy };
    if (response.status === 400) return { state: 'error', message: REPORT_MESSAGES.rejected };
    return { state: 'error', message: REPORT_MESSAGES.error };
  } catch {
    return { state: 'error', message: REPORT_MESSAGES.error };
  }
}

export interface ReportForm extends Readable<ReportFormState> {
  submit(report: Report): Promise<void>;
  reset(): void;
}

// The state of the report form. The page shows it and calls submit() and reset().
export function createReportForm(apiUrl: string, fetchFn: typeof fetch = fetch): ReportForm {
  const state = writable<ReportFormState>({ state: 'idle' });
  let sending = false;

  async function submit(report: Report) {
    // A second tap while the first report travels must not send it twice.
    if (sending) return;
    sending = true;
    state.set({ state: 'sending' });
    state.set(await sendReport(fetchFn, apiUrl, report));
    sending = false;
  }

  function reset() {
    state.set({ state: 'idle' });
  }

  return { subscribe: state.subscribe, submit, reset };
}
