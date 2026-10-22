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
  { state: 'ok'; view: StatusView } | { state: 'unavailable'; message: string };

export const MESSAGES = {
  computing: 'Estamos calculando el estado. Intenta de nuevo en unos segundos.',
  error: 'No pudimos cargar el estado. Revisa tu conexión e intenta de nuevo.'
};

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
export async function loadStatus(fetchFn: typeof fetch, apiUrl: string): Promise<StatusPageData> {
  try {
    const response = await fetchFn(`${apiUrl}/status`);
    // 503 only happens right after the API starts, before the first count (docs/api.md).
    if (response.status === 503) return { state: 'unavailable', message: MESSAGES.computing };
    if (!response.ok) return { state: 'unavailable', message: MESSAGES.error };
    const status: StatusResponse = await response.json();
    return { state: 'ok', view: buildStatusView(status) };
  } catch {
    return { state: 'unavailable', message: MESSAGES.error };
  }
}
