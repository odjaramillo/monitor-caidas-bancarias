import type { Db } from './db.js';
import {
  computeStatus,
  WINDOW_MINUTES,
  type Bank,
  type RecentReport,
  type Status
} from './levels.js';

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
export function createStatusWorker({ db, intervalMs, log }: StatusWorkerDeps): StatusWorker {
  let status: Status | undefined;
  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<void> | undefined;

  async function pass(): Promise<void> {
    const now = new Date();
    const oldest = new Date(now.getTime() - WINDOW_MINUTES * 60_000);
    try {
      // Two queries per pass, whatever the number of pairs; computeStatus does the counting.
      const [banks, reports] = await Promise.all([
        db.query<Bank>('select id, name from banks order by id'),
        db.query<{ origin: string; destination: string; created_at: Date }>(
          'select origin, destination, created_at from reports where created_at > $1',
          [oldest]
        )
      ]);
      status = computeStatus({
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
