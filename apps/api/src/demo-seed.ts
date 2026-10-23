import pg from 'pg';
import { effectiveHost, isLocalDatabaseUrl } from './database-url.js';
import type { Db } from './db.js';

// The worker (#6) counts the reports of this window to pick each pair's level.
export const WINDOW_MINUTES = 15;

// One pair per level, the same pairs as the GET /status example in docs/api.md.
// `recent` reports fall inside the window; `old` ones fall outside it and must not count.
// The counts assume the fixed thresholds of #6 put 0 reports in "normal", a few in
// "posibles_problemas" and a dozen in "muchos_reportes". They hold while these pairs have fewer than
// BASELINE_MIN_DAYS days of history at the hour (#33), as on a fresh database; the seed only writes
// today's reports. If the thresholds change, change only these numbers.
export const DEMO_PAIRS = [
  { origin: 'banesco', destination: 'mercantil', level: 'muchos_reportes', recent: 12, old: 0 },
  { origin: 'venezuela', destination: 'banesco', level: 'posibles_problemas', recent: 2, old: 0 },
  { origin: 'mercantil', destination: 'provincial', level: 'normal', recent: 0, old: 3 }
] as const;

const FAILURE_TYPES = ['no_sale', 'sale_no_llega', 'error_app', 'punto_de_venta'] as const;

// Recent reports are 1 to 5 minutes old, so the levels hold for about 10 minutes after the seed.
const RECENT_SPREAD_MINUTES = 5;

export interface DemoReport {
  origin: string;
  destination: string;
  type: string;
  minutesAgo: number;
}

// buildDemoReports dates each report relative to now: with fixed dates the demo goes back to "normal".
export function buildDemoReports(): DemoReport[] {
  return DEMO_PAIRS.flatMap(({ origin, destination, recent, old }) => [
    ...Array.from({ length: recent }, (_, i) => ({
      origin,
      destination,
      type: FAILURE_TYPES[i % FAILURE_TYPES.length],
      minutesAgo: 1 + (i % RECENT_SPREAD_MINUTES)
    })),
    ...Array.from({ length: old }, (_, i) => ({
      origin,
      destination,
      type: FAILURE_TYPES[i % FAILURE_TYPES.length],
      minutesAgo: WINDOW_MINUTES + 5 + i
    }))
  ]);
}

// seedDemo replaces the reports of the demo pairs in one statement, so running it twice gives the
// same levels. Reports of every other pair stay untouched.
export async function seedDemo(db: Db): Promise<number> {
  const reports = buildDemoReports();
  const result = await db.query(
    `with cleared as (
       delete from reports r
       using unnest($1::text[], $2::text[]) as demo(origin, destination)
       where r.origin = demo.origin and r.destination = demo.destination
     )
     insert into reports (origin, destination, type, created_at)
     select origin, destination, type, now() - make_interval(mins => minutes_ago)
     from unnest($3::text[], $4::text[], $5::text[], $6::int[])
       as demo(origin, destination, type, minutes_ago)`,
    [
      DEMO_PAIRS.map((pair) => pair.origin),
      DEMO_PAIRS.map((pair) => pair.destination),
      reports.map((report) => report.origin),
      reports.map((report) => report.destination),
      reports.map((report) => report.type),
      reports.map((report) => report.minutesAgo)
    ]
  );
  return result.rowCount ?? 0;
}

export interface SeedDemoOptions {
  databaseUrl: string;
  db: Db;
  // Asks the person to confirm the host before the seed writes to a database that is not local.
  confirm: (host: string) => Promise<boolean>;
}

export type SeedDemoResult = { outcome: 'seeded'; reports: number } | { outcome: 'cancelled' };

export async function runSeedDemo({
  databaseUrl,
  db,
  confirm
}: SeedDemoOptions): Promise<SeedDemoResult> {
  if (!isLocalDatabaseUrl(databaseUrl)) {
    const host = effectiveHost(databaseUrl);
    // An unreadable URL is refused: asking about it would mean printing it, password included.
    if (host === undefined || !(await confirm(host))) return { outcome: 'cancelled' };
  }
  return { outcome: 'seeded', reports: await seedDemo(db) };
}

// One connection is enough: the seed is a single statement.
export function openDemoPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl, max: 1 });
}

export interface SeedDemoCommandDeps {
  createDb: (databaseUrl: string) => Db & { end: () => Promise<void> };
  ask: (question: string) => Promise<string>;
  log: (line: string) => void;
  error: (line: string) => void;
}

// seedDemoCommand is the whole `seed:demo` command; seed-demo.ts only wires it to the terminal.
// It returns the exit code.
// eslint-disable-next-line max-lines-per-function -- Longer than the cap before #120. Tracking issue: #135.
export async function seedDemoCommand(
  env: NodeJS.ProcessEnv,
  { createDb, ask, log, error }: SeedDemoCommandDeps
): Promise<number> {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    error('DATABASE_URL is not set. Copy .env.example to .env, or export the URL to seed.');
    return 1;
  }
  if (effectiveHost(databaseUrl) === undefined) {
    error(
      'DATABASE_URL is not a valid PostgreSQL URL, so the seed cannot tell which database to use.'
    );
    return 1;
  }

  const pairs = DEMO_PAIRS.map((pair) => `${pair.origin} -> ${pair.destination}`).join(', ');
  const confirm = async (host: string) => {
    const answer = await ask(
      `${host} is not a local database. The seed replaces the reports of ${pairs}.\n` +
        'Type the host name to continue: '
    );
    return answer.trim() === host;
  };

  const db = createDb(databaseUrl);
  try {
    const result = await runSeedDemo({ databaseUrl, db, confirm });
    log(
      result.outcome === 'seeded'
        ? `Seeded ${result.reports} demo reports.`
        : 'Cancelled: nothing was written.'
    );
    return 0;
  } finally {
    await db.end();
  }
}
