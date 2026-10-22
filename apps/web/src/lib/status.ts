import { writable, type Readable } from 'svelte/store';
import { bankName, LEVEL_LABELS, type Level } from './banks.js';

// GET /status, as docs/api.md defines it.
export interface StatusPair {
  origin: string;
  destination: string;
  level: Level;
  reports: number;
  message: string;
}

export interface StatusResponse {
  updatedAt: string;
  windowMinutes: number;
  pairs: StatusPair[];
}

// What the status screen shows, already in the order of the sketch (docs/bocetos).
export interface PairView {
  key: string;
  route: string;
  level: Level;
  levelLabel: string;
  message: string;
}

export interface StatusView {
  alerts: PairView[];
  normalCount: number;
  normalSummary: string;
  all: PairView[];
  updatedAt: string;
}

export type StatusPageData =
  | { state: 'loading' }
  | { state: 'computing' }
  | { state: 'error' }
  | { state: 'ok'; view: StatusView };

export const MESSAGES = {
  loading: 'Cargando estado…',
  computing: 'Estamos calculando el estado. Intenta de nuevo en unos segundos.',
  // The same text for a network failure, a timeout, an HTTP error and a CORS block.
  error: 'No pudimos cargar el estado. Intenta de nuevo.',
  empty: 'Todavía no hay pares de bancos para mostrar.'
};

// Render can take tens of seconds to wake a sleeping API.
// After this time the screen stops waiting and offers to try again (R7).
const TIMEOUT_MS = 8000;

const DEFAULT_API_URL = 'http://localhost:3000';

// Red cards go before yellow ones. Inside a level, the API order (most reports first) stays.
const SEVERITY: Record<Level, number> = { muchos_reportes: 0, posibles_problemas: 1, normal: 2 };

// The API sends UTC. People read the time of Venezuela.
const timeFormat = new Intl.DateTimeFormat('es-VE', {
  timeZone: 'America/Caracas',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

export function apiBaseUrl(value: string | undefined): string {
  return (value || DEFAULT_API_URL).replace(/\/+$/, '');
}

function toView(pair: StatusPair): PairView {
  return {
    key: `${pair.origin}-${pair.destination}`,
    route: `${bankName(pair.origin)} → ${bankName(pair.destination)}`,
    level: pair.level,
    levelLabel: LEVEL_LABELS[pair.level],
    message: pair.message
  };
}

// The text of the single green card. It counts pairs and never says a bank is down (R4).
function normalSummary(normalCount: number, hasAlerts: boolean): string {
  if (normalCount === 0) return '';
  if (!hasAlerts && normalCount === 1) return 'El único par está en nivel normal';
  if (!hasAlerts) return `Los ${normalCount} pares están en nivel normal`;
  if (normalCount === 1) return 'El otro par está en nivel normal';
  return `Los otros ${normalCount} pares están en nivel normal`;
}

export function buildStatusView(status: StatusResponse): StatusView {
  const all = status.pairs.map(toView);
  const alerts = all
    .filter((pair) => pair.level !== 'normal')
    .sort((a, b) => SEVERITY[a.level] - SEVERITY[b.level]);
  const normalCount = all.length - alerts.length;

  return {
    alerts,
    normalCount,
    normalSummary: normalSummary(normalCount, alerts.length > 0),
    all,
    updatedAt: timeFormat.format(new Date(status.updatedAt))
  };
}

// Never throws: the screen always gets something to show, even when the API is down.
export async function loadStatus(
  fetchFn: typeof fetch,
  apiUrl: string,
  signal: AbortSignal = AbortSignal.timeout(TIMEOUT_MS)
): Promise<StatusPageData> {
  try {
    const response = await fetchFn(`${apiUrl}/status`, { signal });
    // 503 only happens right after the API starts, before the first count (docs/api.md).
    if (response.status === 503) return { state: 'computing' };
    if (!response.ok) return { state: 'error' };
    const status: StatusResponse = await response.json();
    return { state: 'ok', view: buildStatusView(status) };
  } catch {
    return { state: 'error' };
  }
}

export interface StatusScreen extends Readable<StatusPageData> {
  refresh(): Promise<void>;
}

// The state of the status screen. It starts in the loading state, so the page shows at once.
// The first subscriber (the page) starts the request. The retry button calls refresh().
export function createStatusScreen(apiUrl: string, fetchFn: typeof fetch = fetch): StatusScreen {
  const state = writable<StatusPageData>({ state: 'loading' }, () => {
    refresh();
  });

  async function refresh() {
    state.set({ state: 'loading' });
    state.set(await loadStatus(fetchFn, apiUrl));
  }

  return { subscribe: state.subscribe, refresh };
}
