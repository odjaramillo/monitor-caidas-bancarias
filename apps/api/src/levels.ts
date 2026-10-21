// Window of reports that counts toward a pair's level (R1).
export const WINDOW_MINUTES = 15;

// Fixed thresholds of the first version. Counts of reports inside the window:
//   0       -> normal
//   1 to 4  -> posibles_problemas
//   5 or up -> muchos_reportes
// With no baseline yet, any report is shown as a possible problem: the screen says how many people
// reported (R4) and never that a bank is down, so a lone report cannot mislead. Five people
// reporting the same pair in 15 minutes is a pattern, not one person's bad connection. The
// hour-of-day baseline (#33) replaces these numbers in Cut 2. If you change them, adjust DEMO_PAIRS
// in demo-seed.ts and docs/datos.md.
export const POSSIBLE_PROBLEMS_THRESHOLD = 1;
export const MANY_REPORTS_THRESHOLD = 5;

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

export function levelFor(reports: number): Level {
  if (reports >= MANY_REPORTS_THRESHOLD) return 'muchos_reportes';
  if (reports >= POSSIBLE_PROBLEMS_THRESHOLD) return 'posibles_problemas';
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
}

// computeStatus is pure: the caller reads the reports and passes the clock, so it needs no database.
// A report counts when it is less than WINDOW_MINUTES old and not dated after `now`.
export function computeStatus({ reports, banks, now }: ComputeStatusInput): Status {
  const nowMs = now.getTime();
  const oldestMs = nowMs - WINDOW_MINUTES * 60_000;

  const counts = new Map<string, number>();
  for (const { origin, destination, createdAt } of reports) {
    const createdMs = createdAt.getTime();
    if (createdMs <= oldestMs || createdMs > nowMs) continue;
    const key = `${origin}\u0000${destination}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // Array.prototype.sort is stable, so equal counts keep the order of the bank list.
  const pairs = banks
    .flatMap((origin) =>
      banks.map((destination): PairStatus => {
        const count = counts.get(`${origin.id}\u0000${destination.id}`) ?? 0;
        return {
          origin: origin.id,
          destination: destination.id,
          level: levelFor(count),
          reports: count,
          message: messageFor(count, origin.name, destination.name)
        };
      })
    )
    .sort((a, b) => b.reports - a.reports);

  return { updatedAt: now.toISOString(), windowMinutes: WINDOW_MINUTES, pairs };
}
