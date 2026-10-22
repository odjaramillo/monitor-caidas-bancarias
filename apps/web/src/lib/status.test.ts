import { describe, expect, it, vi } from 'vitest';
import { bankName } from './banks.js';
import {
  apiBaseUrl,
  buildStatusView,
  loadStatus,
  MESSAGES,
  type StatusPair,
  type StatusResponse
} from './status.js';

function pair(
  origin: string,
  destination: string,
  level: StatusPair['level'],
  reports: number
): StatusPair {
  return { origin, destination, level, reports, message: `${reports} reportes` };
}

// The example response of GET /status in docs/api.md.
const example: StatusResponse = {
  updatedAt: '2026-10-28T14:05:30.000Z',
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
};

function fakeFetch(response: Response | Error) {
  return vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  }) as unknown as typeof fetch;
}

describe('bankName', () => {
  it('uses the name from the contract list', () => {
    expect(bankName('provincial')).toBe('BBVA Provincial');
  });

  it('falls back to the id for a bank this copy does not have yet', () => {
    expect(bankName('nuevo')).toBe('nuevo');
  });
});

describe('apiBaseUrl', () => {
  it('uses PUBLIC_API_URL without a trailing slash', () => {
    expect(apiBaseUrl('https://api.example.com/')).toBe('https://api.example.com');
  });

  it('falls back to the local API when the variable is missing or empty', () => {
    expect(apiBaseUrl(undefined)).toBe('http://localhost:3000');
    expect(apiBaseUrl('')).toBe('http://localhost:3000');
  });
});

describe('buildStatusView', () => {
  it('keeps the pairs with problems as cards and counts the normal ones', () => {
    const view = buildStatusView(example);

    expect(view.alerts.map((p) => p.key)).toEqual(['banesco-mercantil', 'venezuela-banesco']);
    expect(view.alerts[0]).toEqual({
      key: 'banesco-mercantil',
      route: 'Banesco → Mercantil',
      level: 'muchos_reportes',
      levelLabel: 'Muchos reportes',
      message: example.pairs[0].message
    });
    expect(view.normalCount).toBe(1);
    expect(view.normalSummary).toBe('El otro par está en nivel normal');
    expect(view.all).toHaveLength(3);
  });

  it('puts red cards before yellow ones, and keeps the API order inside a level', () => {
    const view = buildStatusView({
      ...example,
      pairs: [
        pair('bnc', 'plaza', 'posibles_problemas', 9),
        pair('bdt', 'bnc', 'muchos_reportes', 5),
        pair('plaza', 'bdt', 'posibles_problemas', 2),
        pair('bnc', 'bdt', 'muchos_reportes', 3)
      ]
    });

    expect(view.alerts.map((p) => p.key)).toEqual(['bdt-bnc', 'bnc-bdt', 'bnc-plaza', 'plaza-bdt']);
  });

  it('says how many other pairs are normal', () => {
    const view = buildStatusView({
      ...example,
      pairs: [...example.pairs, pair('plaza', 'bnc', 'normal', 0)]
    });

    expect(view.normalSummary).toBe('Los otros 2 pares están en nivel normal');
  });

  it('says that every pair is normal when none has problems', () => {
    const view = buildStatusView({
      ...example,
      pairs: [pair('bnc', 'plaza', 'normal', 0), pair('plaza', 'bnc', 'normal', 1)]
    });

    expect(view.alerts).toEqual([]);
    expect(view.normalSummary).toBe('Los 2 pares están en nivel normal');
  });

  it('shows the update time in Venezuela, not in UTC', () => {
    expect(buildStatusView(example).updatedAt).toBe('10:05');
  });

  it('never says that a bank is down (R4)', () => {
    const view = buildStatusView(example);
    const texts = [view.normalSummary, ...view.all.flatMap((p) => [p.levelLabel, p.message])];

    for (const text of texts) expect(text).not.toMatch(/caíd/i);
  });
});

describe('loadStatus', () => {
  it('asks GET /status and builds the view', async () => {
    const fetch = fakeFetch(Response.json(example));

    const data = await loadStatus(fetch, 'https://api.example.com');

    expect(fetch).toHaveBeenCalledWith('https://api.example.com/status');
    expect(data).toEqual({ state: 'ok', view: buildStatusView(example) });
  });

  it('asks to wait when the status is not computed yet (503)', async () => {
    const data = await loadStatus(fakeFetch(new Response(null, { status: 503 })), '');

    expect(data).toEqual({ state: 'unavailable', message: MESSAGES.computing });
  });

  it('shows an error for any other failed answer', async () => {
    const data = await loadStatus(fakeFetch(new Response(null, { status: 500 })), '');

    expect(data).toEqual({ state: 'unavailable', message: MESSAGES.error });
  });

  it('shows an error when the network fails', async () => {
    const data = await loadStatus(fakeFetch(new TypeError('Failed to fetch')), '');

    expect(data).toEqual({ state: 'unavailable', message: MESSAGES.error });
  });
});
