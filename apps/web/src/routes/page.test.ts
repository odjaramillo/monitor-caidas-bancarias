import { render } from 'svelte/server';
import { writable } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildStatusView, MESSAGES, type StatusPageData, type StatusScreen } from '#lib/status.js';
import Page from './+page.svelte';
import { load, ssr } from './+page.js';

const updatedAt = '2026-10-28T14:05:30.000Z';

const withAlerts = buildStatusView({
  updatedAt,
  windowMinutes: 15,
  pairs: [
    {
      origin: 'banesco',
      destination: 'mercantil',
      level: 'muchos_reportes',
      reports: 12,
      message:
        '12 personas reportan problemas con pagos de Banesco a Mercantil en los últimos 15 minutos'
    },
    {
      origin: 'venezuela',
      destination: 'banesco',
      level: 'posibles_problemas',
      reports: 1,
      message:
        '1 persona reporta problemas con pagos de Banco de Venezuela a Banesco en los últimos 15 minutos'
    },
    {
      origin: 'mercantil',
      destination: 'provincial',
      level: 'normal',
      reports: 0,
      message: 'Sin reportes en los últimos 15 minutos'
    }
  ]
});

// The server render has no DOM, so the screen comes from a fixed store.
// The tests of createStatusScreen in status.test.ts cover the fetch and the retry.
function renderPage(state: StatusPageData) {
  const screen = { subscribe: writable(state).subscribe, refresh: vi.fn(async () => {}) };
  // A variable, not an object literal, so the test does not depend on every prop SvelteKit adds.
  const props = { data: { screen }, params: {}, form: null };
  return render(Page, { props });
}

// The text of each row of the full list, without tags.
function rows(body: string): string[] {
  return [...body.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((match) =>
    match[1].replace(/<[^>]+>/g, ' ')
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('status page', () => {
  it('renders without waiting for the API, and asks for the status from the component', () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    const data = load({} as Parameters<typeof load>[0]) as { screen: StatusScreen };

    expect(ssr).toBe(false);
    expect(data).not.toBeInstanceOf(Promise);
    expect(fetch).not.toHaveBeenCalled();

    // The page subscribes to the screen when it renders.
    let shown: StatusPageData | undefined;
    const stop = data.screen.subscribe((state) => (shown = state));
    stop();

    expect(shown).toEqual({ state: 'loading' });
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/status$/), {
      signal: expect.any(AbortSignal)
    });
  });

  it('shows the loading state and the report button while the status loads', () => {
    const { body } = renderPage({ state: 'loading' });

    expect(body).toMatch(/<h1[^>]*>Monitor de caídas bancarias<\/h1>/);
    expect(body).toMatch(/<p[^>]*role="status"[^>]*>Cargando estado…<\/p>/);
    expect(body).toContain('href="/reportar"');
    expect(body).not.toContain('Reintentar');
  });

  it('shows the error as an alert with a retry button and the report button', () => {
    const { body } = renderPage({ state: 'error' });

    expect(MESSAGES.error).toBe('No pudimos cargar el estado. Intenta de nuevo.');
    expect(body).toMatch(
      /<p[^>]*role="alert"[^>]*>No pudimos cargar el estado\. Intenta de nuevo\.<\/p>/
    );
    expect(body).toMatch(/<button[^>]*type="button"[^>]*>Reintentar<\/button>/);
    expect(body).not.toContain('Ver todos los pares');
    expect(body).toContain('href="/reportar"');
  });

  it('asks to wait, with a retry button, while the API computes the first status', () => {
    const { body } = renderPage({ state: 'computing' });

    expect(body).toMatch(new RegExp(`<p[^>]*role="status"[^>]*>${MESSAGES.computing}</p>`));
    expect(body).toMatch(/<button[^>]*>Reintentar<\/button>/);
    expect(body).toContain('href="/reportar"');
  });

  it('shows a card for each pair with problems and one card for the normal ones', () => {
    const { body, head } = renderPage({ state: 'ok', view: withAlerts });

    expect(head).toContain('<title>Monitor de caídas bancarias</title>');
    // The scoped styles add a class to each element, so the tags are matched with a pattern.
    expect(body).toMatch(/<h2[^>]*>Normal<\/h2>/);
    expect(body).toMatch(/<h2[^>]*>Muchos reportes<\/h2>/);
    expect(body).toMatch(/<h2[^>]*>Posibles problemas<\/h2>/);
    expect(body).toContain('12 personas reportan problemas con pagos de Banesco a Mercantil');
    expect(body).toContain('El otro par está en nivel normal');
    expect(body).toContain('Ver todos los pares');
    expect(body).toContain('Actualizado a las 10:05');
    expect(body).toContain('href="/reportar"');
    expect(body).not.toContain('role="alert"');
  });

  it('writes the level of each pair as text in the full list', () => {
    const { body } = renderPage({ state: 'ok', view: withAlerts });

    const texts = rows(body);

    expect(texts).toHaveLength(3);
    expect(texts[0]).toContain('Banesco → Mercantil');
    expect(texts[0]).toContain('Muchos reportes');
    expect(texts[1]).toContain('Banco de Venezuela → Banesco');
    expect(texts[1]).toContain('Posibles problemas');
    expect(texts[2]).toContain('Mercantil → BBVA Provincial');
    expect(texts[2]).toContain('Normal');
  });

  it('leaves out the normal card when every pair has problems', () => {
    const view = { ...withAlerts, normalCount: 0, normalSummary: '' };

    const { body } = renderPage({ state: 'ok', view });

    expect(body).not.toMatch(/<h2[^>]*>Normal<\/h2>/);
  });

  it('shows one plain message when the API sends no pairs', () => {
    const view = buildStatusView({ updatedAt, windowMinutes: 15, pairs: [] });

    const { body } = renderPage({ state: 'ok', view });

    expect(body).toContain(MESSAGES.empty);
    expect(body).not.toContain('<article');
    expect(body).not.toContain('Ver todos los pares');
    expect(body).toContain('Actualizado a las 10:05');
    expect(body).toContain('href="/reportar"');
  });
});
