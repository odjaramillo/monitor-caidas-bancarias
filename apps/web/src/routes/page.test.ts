import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import { buildStatusView, MESSAGES, type StatusPageData } from '#lib/status.js';
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
      origin: 'mercantil',
      destination: 'provincial',
      level: 'normal',
      reports: 0,
      message: 'Sin reportes en los últimos 15 minutos'
    }
  ]
});

function renderPage(data: StatusPageData) {
  // A variable, not an object literal, so the test does not depend on every prop SvelteKit adds.
  const props = { data, params: {}, form: null };
  return render(Page, { props });
}

describe('status page', () => {
  it('loads the status in the browser, not at build time', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 503 }));

    const data = await load({ fetch } as unknown as Parameters<typeof load>[0]);

    expect(ssr).toBe(false);
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/status$/));
    expect(data).toEqual({ state: 'unavailable', message: MESSAGES.computing });
  });

  it('shows a card for each pair with problems and one card for the normal ones', () => {
    const { body, head } = renderPage({ state: 'ok', view: withAlerts });

    expect(head).toContain('<title>Monitor de caídas bancarias</title>');
    // The scoped styles add a class to each element, so the tags are matched with a pattern.
    expect(body).toMatch(/<h1[^>]*>Monitor de caídas bancarias<\/h1>/);
    expect(body).toMatch(/<h2[^>]*>Normal<\/h2>/);
    expect(body).toContain('Muchos reportes');
    expect(body).toContain('12 personas reportan problemas con pagos de Banesco a Mercantil');
    expect(body).toContain('El otro par está en nivel normal');
    expect(body).toContain('Ver todos los pares');
    expect(body).toContain('Banesco → Mercantil');
    expect(body).toContain('Actualizado a las 10:05');
    expect(body).toContain('href="/reportar"');
  });

  it('leaves out the normal card when every pair has problems', () => {
    const view = { ...withAlerts, normalCount: 0, normalSummary: '' };

    const { body } = renderPage({ state: 'ok', view });

    expect(body).not.toMatch(/<h2[^>]*>Normal<\/h2>/);
  });

  it('shows the message when the status cannot be read', () => {
    const { body } = renderPage({ state: 'unavailable', message: MESSAGES.error });

    expect(body).toContain(MESSAGES.error);
    expect(body).not.toContain('Ver todos los pares');
    expect(body).toContain('Reportar un problema');
  });
});
