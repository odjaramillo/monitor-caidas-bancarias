import { describe, expect, it, vi } from 'vitest';
import {
  canSend,
  createReportForm,
  REPORT_MESSAGES,
  sendReport,
  type Report,
  type ReportFormState
} from './report.js';

// The example request of POST /reports in docs/api.md.
const report: Report = { origin: 'banesco', destination: 'mercantil', type: 'sale_no_llega' };

const created = () =>
  Response.json({ id: 1834, ...report, createdAt: '2026-10-28T14:05:12.483Z' }, { status: 201 });

function fakeFetch(response: Response | Error) {
  return vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  }) as unknown as typeof fetch;
}

describe('canSend', () => {
  it('is true only when origin, destination and type are chosen', () => {
    expect(canSend('banesco', 'mercantil', 'no_sale', 'idle')).toBe(true);
    expect(canSend('', 'mercantil', 'no_sale', 'idle')).toBe(false);
    expect(canSend('banesco', '', 'no_sale', 'idle')).toBe(false);
    expect(canSend('banesco', 'mercantil', '', 'idle')).toBe(false);
  });

  it('is false while a bank list has not read its answer from the page yet', () => {
    expect(canSend(undefined, 'mercantil', 'no_sale', 'idle')).toBe(false);
    expect(canSend('banesco', undefined, 'no_sale', 'idle')).toBe(false);
  });

  it('allows sending again after an error, but not while a report travels', () => {
    expect(canSend('banesco', 'mercantil', 'no_sale', 'error')).toBe(true);
    expect(canSend('banesco', 'mercantil', 'no_sale', 'sending')).toBe(false);
  });
});

describe('sendReport', () => {
  it('sends POST /reports with the JSON body of the contract', async () => {
    const fetch = fakeFetch(created());

    const result = await sendReport(fetch, 'https://api.example.com', report);

    expect(fetch).toHaveBeenCalledWith('https://api.example.com/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      signal: expect.any(AbortSignal)
    });
    expect(result).toEqual({ state: 'sent' });
  });

  it('asks to try again in a few seconds when the database does not answer (503)', async () => {
    const result = await sendReport(fakeFetch(new Response(null, { status: 503 })), '', report);

    expect(result).toEqual({ state: 'error', message: REPORT_MESSAGES.busy });
  });

  it('asks to reload when the API rejects the body (400)', async () => {
    const result = await sendReport(fakeFetch(new Response(null, { status: 400 })), '', report);

    expect(result).toEqual({ state: 'error', message: REPORT_MESSAGES.rejected });
  });

  it('shows the general error for any other answer', async () => {
    const result = await sendReport(fakeFetch(new Response(null, { status: 500 })), '', report);

    expect(result).toEqual({ state: 'error', message: REPORT_MESSAGES.error });
  });

  it('shows the general error when the network fails or the time runs out', async () => {
    const result = await sendReport(fakeFetch(new TypeError('Failed to fetch')), '', report);

    expect(result).toEqual({ state: 'error', message: REPORT_MESSAGES.error });
  });

  it('never says that a bank is down (R4)', () => {
    for (const text of Object.values(REPORT_MESSAGES)) expect(text).not.toMatch(/caíd/i);
  });
});

describe('createReportForm', () => {
  // Keeps one subscriber, like the page, and returns the last state it saw.
  function watch(form: ReturnType<typeof createReportForm>) {
    let current: ReportFormState | undefined;
    form.subscribe((state) => (current = state));
    return () => current;
  }

  it('starts idle, shows sending while the report travels, and ends sent', async () => {
    let answer: (response: Response) => void = () => {};
    const api = vi.fn(
      () => new Promise<Response>((resolve) => (answer = resolve))
    ) as unknown as typeof fetch;
    const form = createReportForm('https://api.example.com', api);
    const shown = watch(form);

    expect(shown()).toEqual({ state: 'idle' });

    const sending = form.submit(report);
    expect(shown()).toEqual({ state: 'sending' });

    answer(created());
    await sending;
    expect(shown()).toEqual({ state: 'sent' });
  });

  it('sends only once when the button is tapped twice', async () => {
    const fetch = fakeFetch(created());
    const form = createReportForm('', fetch);

    await Promise.all([form.submit(report), form.submit(report)]);

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('can send again after an error', async () => {
    const api = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(created()) as unknown as typeof fetch;
    const form = createReportForm('', api);
    const shown = watch(form);

    await form.submit(report);
    expect(shown()).toEqual({ state: 'error', message: REPORT_MESSAGES.error });

    await form.submit(report);
    expect(shown()).toEqual({ state: 'sent' });
  });

  it('goes back to idle to send another report', async () => {
    const form = createReportForm('', fakeFetch(created()));
    const shown = watch(form);

    await form.submit(report);
    form.reset();

    expect(shown()).toEqual({ state: 'idle' });
  });

  it('uses the browser fetch when none is given', () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(created());

    createReportForm('').submit(report);

    expect(fetch).toHaveBeenCalledWith('/reports', expect.objectContaining({ method: 'POST' }));
    fetch.mockRestore();
  });
});
