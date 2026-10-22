import { afterEach, describe, expect, it, vi } from 'vitest';
import { bankName } from './banks.js';
import {
  apiBaseUrl,
  buildStatusView,
  createStatusScreen,
  loadStatus,
  type StatusPageData,
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

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it('uses the singular when the only pair is normal', () => {
    const view = buildStatusView({ ...example, pairs: [pair('bnc', 'plaza', 'normal', 0)] });

    expect(view.normalSummary).toBe('El único par está en nivel normal');
  });

  it('gives no cards and no summary when the API sends no pairs', () => {
    const view = buildStatusView({ ...example, pairs: [] });

    expect(view).toMatchObject({ alerts: [], normalCount: 0, normalSummary: '', all: [] });
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

    expect(fetch).toHaveBeenCalledWith('https://api.example.com/status', {
      signal: expect.any(AbortSignal)
    });
    expect(data).toEqual({ state: 'ok', view: buildStatusView(example) });
  });

  it('stops waiting after 8 seconds', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');

    await loadStatus(fakeFetch(Response.json(example)), '');

    expect(timeout).toHaveBeenCalledWith(8000);
  });

  it('shows an error when the wait ends before the API answers', async () => {
    const controller = new AbortController();
    // Like the browser fetch: it rejects only when the signal aborts.
    const fetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        })
    ) as unknown as typeof globalThis.fetch;

    const pending = loadStatus(fetch, '', controller.signal);
    controller.abort(new DOMException('The operation timed out.', 'TimeoutError'));

    expect(await pending).toEqual({ state: 'error' });
  });

  it('asks to wait when the status is not computed yet (503)', async () => {
    const data = await loadStatus(fakeFetch(new Response(null, { status: 503 })), '');

    expect(data).toEqual({ state: 'computing' });
  });

  it('shows an error for any other failed answer', async () => {
    const data = await loadStatus(fakeFetch(new Response(null, { status: 500 })), '');

    expect(data).toEqual({ state: 'error' });
  });

  it('shows an error when the network fails', async () => {
    const data = await loadStatus(fakeFetch(new TypeError('Failed to fetch')), '');

    expect(data).toEqual({ state: 'error' });
  });
});

describe('createStatusScreen', () => {
  // Keeps one subscriber, like the page, and returns the last state it saw.
  function watch(screen: ReturnType<typeof createStatusScreen>) {
    let current: StatusPageData | undefined;
    screen.subscribe((state) => (current = state));
    return () => current;
  }

  it('starts in the loading state and asks the API when the page subscribes', async () => {
    const fetch = fakeFetch(Response.json(example));
    const screen = createStatusScreen('https://api.example.com', fetch);

    expect(fetch).not.toHaveBeenCalled();
    const shown = watch(screen);

    expect(shown()).toEqual({ state: 'loading' });
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/status', {
      signal: expect.any(AbortSignal)
    });
    await vi.waitFor(() =>
      expect(shown()).toEqual({ state: 'ok', view: buildStatusView(example) })
    );
  });

  it('asks again on retry after a failure and shows the status', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(Response.json(example)) as unknown as typeof globalThis.fetch;
    const screen = createStatusScreen('https://api.example.com', fetch);
    const shown = watch(screen);
    await vi.waitFor(() => expect(shown()).toEqual({ state: 'error' }));

    const retry = screen.refresh();

    expect(shown()).toEqual({ state: 'loading' });
    await retry;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(shown()).toEqual({ state: 'ok', view: buildStatusView(example) });
  });
});
