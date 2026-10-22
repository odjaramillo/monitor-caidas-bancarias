// Window of reports that counts toward a pair's level (R1).
export const WINDOW_MINUTES = 15;

// Fixed thresholds of the first version (#6). Counts of reports inside the window:
//   0       -> normal
//   1 to 4  -> posibles_problemas
//   5 or up -> muchos_reportes
// Any report is a possible problem: the screen says how many people reported (R4) and never that a
// bank is down, so a lone report cannot mislead. Five people reporting the same pair in 15 minutes
// is a pattern, not one person's bad connection. They are the floor of the hourly baseline (#33)
// and the whole rule while a pair has too little history. If you change them, adjust DEMO_PAIRS
// in demo-seed.ts and docs/datos.md.
export const POSSIBLE_PROBLEMS_THRESHOLD = 1;
export const MANY_REPORTS_THRESHOLD = 5;

// Hourly baseline (#33, D20). The baseline of a pair is the average number of reports per
// 15-minute window at the current hour of the day (Venezuela time, UTC-4, no DST) over the last
// BASELINE_LOOKBACK_DAYS days. It needs reports on at least BASELINE_MIN_DAYS different days at that
// hour; with fewer, the fixed thresholds above are the whole rule. With a baseline, a pair is
// posibles_problemas at POSSIBLE_PROBLEMS_FACTOR times it and muchos_reportes at MANY_REPORTS_FACTOR
// times it, and must also pass the matching fixed threshold.
export const BASELINE_LOOKBACK_DAYS = 14;
export const BASELINE_MIN_DAYS = 3;
export const POSSIBLE_PROBLEMS_FACTOR = 2;
export const MANY_REPORTS_FACTOR = 4;

const WINDOWS_PER_HOUR = 60 / WINDOW_MINUTES;

export type Level = 'normal' | 'posibles_problemas' | 'muchos_reportes';

export interface Bank {
  id: string;
  name: string;
}

export interface RecentReport {
  origin: string;
  destination: string;
  createdAt: Date;
}

export interface PairStatus {
  origin: string;
  destination: string;
  level: Level;
  reports: number;
  message: string;
}

export interface Status {
  updatedAt: string;
  windowMinutes: number;
  pairs: PairStatus[];
}

// What a pair reported at the current hour of the day: `days` different days with reports at that
// hour and `reports` in total over those days.
export interface HourlyHistory {
  days: number;
  reports: number;
}

export function pairKey(origin: string, destination: string): string {
  return `${origin}\u0000${destination}`;
}

// The average reports per 15-minute window at that hour, or undefined when the history is too
// short to trust (the caller then uses the fixed thresholds).
export function baselineFor(history: HourlyHistory | undefined): number | undefined {
  if (!history || history.days < BASELINE_MIN_DAYS) return undefined;
  return history.reports / history.days / WINDOWS_PER_HOUR;
}

// Without a baseline the fixed thresholds decide. With one, a count that passes a fixed threshold
// only moves to that level when it is also well above the baseline: a busy hour is not a problem.
export function levelFor(reports: number, baseline?: number): Level {
  if (
    reports >= MANY_REPORTS_THRESHOLD &&
    (baseline === undefined || reports >= MANY_REPORTS_FACTOR * baseline)
  ) {
    return 'muchos_reportes';
  }
  if (
    reports >= POSSIBLE_PROBLEMS_THRESHOLD &&
    (baseline === undefined || reports >= POSSIBLE_PROBLEMS_FACTOR * baseline)
  ) {
    return 'posibles_problemas';
  }
  return 'normal';
}

// The text only counts reports and never claims a bank is down (R4, docs/api.md).
export function messageFor(reports: number, originName: string, destinationName: string): string {
  if (reports === 0) return `Sin reportes en los últimos ${WINDOW_MINUTES} minutos`;
  const who = reports === 1 ? '1 persona reporta' : `${reports} personas reportan`;
  return `${who} problemas con pagos de ${originName} a ${destinationName} en los últimos ${WINDOW_MINUTES} minutos`;
}

export interface ComputeStatusInput {
  reports: readonly RecentReport[];
  banks: readonly Bank[];
  now: Date;
  // History of each pair at the hour of `now`, keyed by pairKey. Pairs missing here have none.
  baselines?: ReadonlyMap<string, HourlyHistory>;
}

// computeStatus is pure: the caller reads the reports and passes the clock, so it needs no database.
// A report counts when it is less than WINDOW_MINUTES old and not dated after `now`.
export function computeStatus({ reports, banks, now, baselines }: ComputeStatusInput): Status {
  const nowMs = now.getTime();
  const oldestMs = nowMs - WINDOW_MINUTES * 60_000;

  const counts = new Map<string, number>();
  for (const { origin, destination, createdAt } of reports) {
    const createdMs = createdAt.getTime();
    if (createdMs <= oldestMs || createdMs > nowMs) continue;
    const key = pairKey(origin, destination);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // Array.prototype.sort is stable, so equal counts keep the order of the bank list.
  const pairs = banks
    .flatMap((origin) =>
      banks.map((destination): PairStatus => {
        const key = pairKey(origin.id, destination.id);
        const count = counts.get(key) ?? 0;
        return {
          origin: origin.id,
          destination: destination.id,
          level: levelFor(count, baselineFor(baselines?.get(key))),
          reports: count,
          message: messageFor(count, origin.name, destination.name)
        };
      })
    )
    .sort((a, b) => b.reports - a.reports);

  return { updatedAt: now.toISOString(), windowMinutes: WINDOW_MINUTES, pairs };
}
