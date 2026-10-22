import { render } from 'svelte/server';
import { writable } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BANKS, FAILURE_TYPES } from '#lib/banks.js';
import { REPORT_MESSAGES, type ReportForm, type ReportFormState } from '#lib/report.js';
import Page from './+page.svelte';
import { load } from './+page.js';

// The server render has no DOM, so the form comes from a fixed store.
// The tests of createReportForm in report.test.ts cover the request and the states.
function renderPage(state: ReportFormState) {
  const form = {
    subscribe: writable(state).subscribe,
    submit: vi.fn(async () => {}),
    reset: vi.fn()
  };
  // A variable, not an object literal, so the test does not depend on every prop SvelteKit adds.
  const props = { data: { form }, params: {}, form: null };
  return render(Page, { props });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('report page', () => {
  it('builds the form without calling the API', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');

    const data = load({} as Parameters<typeof load>[0]) as { form: ReportForm };

    let shown: ReportFormState | undefined;
    data.form.subscribe((state) => (shown = state))();

    expect(shown).toEqual({ state: 'idle' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('asks the three questions with the closed lists of the contract', () => {
    const { body, head } = renderPage({ state: 'idle' });

    expect(head).toContain('<title>Reportar un problema · Monitor de caídas bancarias</title>');
    expect(body).toMatch(/<h1[^>]*>Reportar un problema<\/h1>/);
    expect(body).toContain('¿De qué banco sale el pago?');
    expect(body).toContain('¿A qué banco llega el pago?');
    expect(body).toContain('¿Qué pasó?');

    // Each select offers the 10 banks, once for origin and once for destination.
    for (const [id, name] of Object.entries(BANKS)) {
      expect(
        body.match(new RegExp(`<option value="${id}"[^>]*>${name}</option>`, 'g'))
      ).toHaveLength(2);
    }
    for (const [id, label] of Object.entries(FAILURE_TYPES)) {
      expect(body).toMatch(
        new RegExp(`<input type="radio" name="type" value="${id}"[^>]*/?> ${label}`)
      );
    }
    expect(body).not.toMatch(/<textarea|type="text"/);
  });

  it('selects the placeholder of both bank lists in the saved page, and no bank', () => {
    const { body } = renderPage({ state: 'idle' });

    // Without it the browser selects the first bank. With it, the page that hydrates reads
    // "no bank yet", or the bank the person picked before the JavaScript arrived.
    const placeholders = body.match(/<option value=""[^>]*selected[^>]*>Elige un banco<\/option>/g);
    expect(placeholders).toHaveLength(2);
    expect(body).not.toMatch(/<option value="[^"]+"[^>]*selected/);
  });

  it('keeps the send button off until the three answers are chosen', () => {
    const { body } = renderPage({ state: 'idle' });

    expect(body).toMatch(
      /<button[^>]*type="submit"[^>]*disabled[^>]*>\s*Enviar reporte\s*<\/button>/
    );
    expect(body).toContain('href="/"');
  });

  it('shows that the report is on its way', () => {
    const { body } = renderPage({ state: 'sending' });

    expect(body).toMatch(/<button[^>]*disabled[^>]*>\s*Enviando…\s*<\/button>/);
  });

  it('shows the reason as an alert when the report fails, and lets the person send again', () => {
    const { body } = renderPage({ state: 'error', message: REPORT_MESSAGES.busy });

    expect(body).toMatch(new RegExp(`<p[^>]*role="alert"[^>]*>${REPORT_MESSAGES.busy}</p>`));
    expect(body).toContain('Enviar reporte');
  });

  it('thanks the person and offers to see the status or send another report', () => {
    const { body } = renderPage({ state: 'sent' });

    expect(body).toMatch(/<p[^>]*role="status"[^>]*>Gracias, recibimos tu reporte\.<\/p>/);
    expect(body).toMatch(/<a[^>]*href="\/"[^>]*>Ver el estado<\/a>/);
    expect(body).toMatch(/<button[^>]*>Enviar otro reporte<\/button>/);
    expect(body).not.toContain('<form');
  });
});
