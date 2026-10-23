import type { Db } from './db.js';
import {
  BASELINE_LOOKBACK_DAYS,
  computeStatus,
  pairKey,
  WINDOW_MINUTES,
  type Bank,
  type HourlyHistory,
  type RecentReport,
  type Status
} from './levels.js';

// Reports per pair at the hour of day of $3 (Venezuela time, UTC-4 with no DST) between $1 and $2,
// in one grouped query for all pairs. $2 is one hour before now, so the reports of the current
// hour today (the ones being judged) never count as their own baseline.
const HOURLY_HISTORY_SQL = `
  select origin, destination,
         count(distinct (created_at at time zone 'America/Caracas')::date)::int as days,
         count(*)::int as reports
  from reports
  where created_at >= $1 and created_at < $2
    and extract(hour from created_at at time zone 'America/Caracas')
      = extract(hour from $3::timestamptz at time zone 'America/Caracas')
  group by origin, destination`;

interface HistoryRow extends HourlyHistory {
  origin: string;
  destination: string;
}

// The worker only needs error(), so tests pass a spy and the server passes app.log.
export interface WorkerLog {
  error(obj: object, msg: string): void;
}

export interface StatusWorkerDeps {
  db: Db;
  intervalMs: number;
  log: WorkerLog;
}

export interface StatusWorker {
  // The last computed snapshot, or undefined until the first pass finishes.
  getStatus(): Status | undefined;
  runOnce(): Promise<void>;
  start(): void;
  // Stops the interval and waits for a pass in flight, so the pool can close right after.
  stop(): Promise<void>;
}

// createStatusWorker recalculates every pair in one pass (R1) and keeps the result in memory.
// GET /status reads that snapshot, so requests never wait for the database.
// eslint-disable-next-line max-lines-per-function -- Longer than the cap before #120. Tracking issue: #135.
export function createStatusWorker({ db, intervalMs, log }: StatusWorkerDeps): StatusWorker {
  let status: Status | undefined;
  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<void> | undefined;

  // eslint-disable-next-line max-lines-per-function -- Longer than the cap before #120. Tracking issue: #135.
  async function pass(): Promise<void> {
    const now = new Date();
    const oldest = new Date(now.getTime() - WINDOW_MINUTES * 60_000);
    try {
      // Three queries per pass, whatever the number of pairs; computeStatus does the counting.
      const [banks, reports, history] = await Promise.all([
        db.query<Bank>('select id, name from banks order by id'),
        db.query<{ origin: string; destination: string; created_at: Date }>(
          'select origin, destination, created_at from reports where created_at > $1',
          [oldest]
        ),
        db.query<HistoryRow>(HOURLY_HISTORY_SQL, [
          new Date(now.getTime() - BASELINE_LOOKBACK_DAYS * 86_400_000),
          new Date(now.getTime() - 3_600_000),
          now
        ])
      ]);
      const baselines = new Map(
        history.rows.map((row) => [
          pairKey(row.origin, row.destination),
          { days: row.days, reports: row.reports }
        ])
      );
      status = computeStatus({
        baselines,
        banks: banks.rows,
        reports: reports.rows.map((row): RecentReport => ({
          origin: row.origin,
          destination: row.destination,
          createdAt: row.created_at
        })),
        now
      });
    } catch (err) {
      // Keep the last snapshot: a stale status is better than none, and the next pass retries.
      log.error({ err }, 'status pass failed');
    }
  }

  // A slow database must not stack passes, so a tick is skipped while one is still running.
  function runOnce(): Promise<void> {
    inFlight ??= pass().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  }

  return {
    getStatus: () => status,
    runOnce,
    start() {
      if (timer) return;
      timer = setInterval(() => void runOnce(), intervalMs);
      void runOnce();
    },
    async stop() {
      clearInterval(timer);
      timer = undefined;
      await inFlight;
    }
  };
}
