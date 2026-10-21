import pg from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildDemoReports,
  DEMO_PAIRS,
  openDemoPool,
  runSeedDemo,
  seedDemo,
  seedDemoCommand,
  WINDOW_MINUTES
} from './demo-seed.js';
import type { Db } from './db.js';
import { TEST_DATABASE_URL } from './testing/database.js';

const LOCAL_URL = 'postgresql://mcb:mcb@localhost:5432/mcb';
const REMOTE_URL = 'postgresql://user:secret@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

// A database that fails the test if anything queries it.
const untouchableDb: Db = {
  query: vi.fn(() => {
    throw new Error('the seed must not touch this database');
  }) as unknown as Db['query']
};

describe('buildDemoReports', () => {
  const reports = buildDemoReports();

  it('puts one pair in each level, on distinct pairs', () => {
    expect(new Set(DEMO_PAIRS.map((pair) => pair.level))).toEqual(
      new Set(['normal', 'posibles_problemas', 'muchos_reportes'])
    );
    expect(new Set(DEMO_PAIRS.map((pair) => `${pair.origin}>${pair.destination}`)).size).toBe(3);
  });

  it('gives more recent reports to the busier levels', () => {
    const recent = Object.fromEntries(DEMO_PAIRS.map((pair) => [pair.level, pair.recent]));

    expect(recent.normal).toBe(0);
    expect(recent.posibles_problemas).toBeGreaterThan(0);
    expect(recent.muchos_reportes).toBeGreaterThan(recent.posibles_problemas);
  });

  it.each(DEMO_PAIRS)(
    'creates the recent and old reports of $origin to $destination',
    ({ origin, destination, recent, old }) => {
      const ofPair = reports.filter((r) => r.origin === origin && r.destination === destination);

      expect(ofPair.filter((r) => r.minutesAgo < WINDOW_MINUTES)).toHaveLength(recent);
      expect(ofPair.filter((r) => r.minutesAgo >= WINDOW_MINUTES)).toHaveLength(old);
    }
  );

  it('dates every report relative to now, never in the future', () => {
    expect(reports.every((r) => Number.isInteger(r.minutesAgo) && r.minutesAgo >= 0)).toBe(true);
  });
});

describe('runSeedDemo', () => {
  it('seeds a local database without asking', async () => {
    const confirm = vi.fn();
    const db: Db = {
      query: vi.fn(async () => ({ rowCount: 17 })) as unknown as Db['query']
    };

    await expect(runSeedDemo({ databaseUrl: LOCAL_URL, db, confirm })).resolves.toEqual({
      outcome: 'seeded',
      reports: 17
    });
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks before touching a database that is not local, naming its host', async () => {
    const confirm = vi.fn(async () => false);

    await expect(
      runSeedDemo({ databaseUrl: REMOTE_URL, db: untouchableDb, confirm })
    ).resolves.toEqual({ outcome: 'cancelled' });
    expect(confirm).toHaveBeenCalledWith('aws-0-us-west-2.pooler.supabase.com');
  });

  it('names the host of the host parameter when it overrides localhost', async () => {
    const confirm = vi.fn(async () => false);

    await runSeedDemo({
      databaseUrl: 'postgresql://mcb:mcb@localhost:5432/mcb?host=db.example.com',
      db: untouchableDb,
      confirm
    });

    expect(confirm).toHaveBeenCalledWith('db.example.com');
  });

  it('seeds a database that is not local once the person confirms', async () => {
    const db: Db = {
      query: vi.fn(async () => ({ rowCount: 17 })) as unknown as Db['query']
    };

    await expect(
      runSeedDemo({ databaseUrl: REMOTE_URL, db, confirm: async () => true })
    ).resolves.toEqual({ outcome: 'seeded', reports: 17 });
  });

  it('refuses a URL it cannot read, without asking or querying', async () => {
    const confirm = vi.fn(async () => true);

    await expect(
      runSeedDemo({ databaseUrl: 'not a url', db: untouchableDb, confirm })
    ).resolves.toEqual({ outcome: 'cancelled' });
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('openDemoPool', () => {
  it('opens a single connection to the given database', async () => {
    const pool = openDemoPool(TEST_DATABASE_URL);
    try {
      const { rows } = await pool.query<{ answer: number }>('select 1 as answer');

      expect(rows).toEqual([{ answer: 1 }]);
      expect(pool.options.max).toBe(1);
    } finally {
      await pool.end();
    }
  });
});

describe('seedDemoCommand', () => {
  function fakeDeps(answer = '') {
    const db = {
      query: vi.fn(async () => ({ rowCount: 17 })) as unknown as Db['query'],
      end: vi.fn(async () => {})
    };
    return {
      db,
      deps: {
        createDb: vi.fn(() => db),
        ask: vi.fn(async () => answer),
        log: vi.fn(),
        error: vi.fn()
      }
    };
  }

  it('stops with exit code 1 when DATABASE_URL is missing', async () => {
    const { deps } = fakeDeps();

    await expect(seedDemoCommand({ DATABASE_URL: '  ' }, deps)).resolves.toBe(1);
    expect(deps.error).toHaveBeenCalledWith(expect.stringContaining('DATABASE_URL is not set'));
    expect(deps.createDb).not.toHaveBeenCalled();
  });

  it('stops with exit code 1 on a URL it cannot read, without printing it', async () => {
    const { deps } = fakeDeps();

    await expect(
      seedDemoCommand({ DATABASE_URL: 'postgresql://user:hunter2@[bad/mcb' }, deps)
    ).resolves.toBe(1);
    expect(deps.error).toHaveBeenCalledWith(expect.stringContaining('not a valid'));
    expect(deps.error).not.toHaveBeenCalledWith(expect.stringContaining('hunter2'));
    expect(deps.createDb).not.toHaveBeenCalled();
  });

  it('reports a confirmed seed even when the database counts no rows', async () => {
    const { db, deps } = fakeDeps();
    db.query = vi.fn(async () => ({ rowCount: null })) as unknown as Db['query'];

    await expect(seedDemoCommand({ DATABASE_URL: LOCAL_URL }, deps)).resolves.toBe(0);
    expect(deps.log).toHaveBeenCalledWith('Seeded 0 demo reports.');
  });

  it('seeds a local database and closes the connection', async () => {
    const { db, deps } = fakeDeps();

    await expect(seedDemoCommand({ DATABASE_URL: LOCAL_URL }, deps)).resolves.toBe(0);
    expect(deps.createDb).toHaveBeenCalledWith(LOCAL_URL);
    expect(deps.ask).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith('Seeded 17 demo reports.');
    expect(db.end).toHaveBeenCalled();
  });

  it('seeds a remote database when the person types its host', async () => {
    const { deps } = fakeDeps(' aws-0-us-west-2.pooler.supabase.com \n');

    await expect(seedDemoCommand({ DATABASE_URL: REMOTE_URL }, deps)).resolves.toBe(0);
    expect(deps.ask).toHaveBeenCalledWith(
      expect.stringContaining('banesco -> mercantil, venezuela -> banesco')
    );
    expect(deps.log).toHaveBeenCalledWith('Seeded 17 demo reports.');
  });

  it('cancels when the answer is not the host', async () => {
    const { db, deps } = fakeDeps('y');

    await expect(seedDemoCommand({ DATABASE_URL: REMOTE_URL }, deps)).resolves.toBe(0);
    expect(db.query).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith('Cancelled: nothing was written.');
    expect(db.end).toHaveBeenCalled();
  });

  it('closes the connection when the seed fails', async () => {
    const { db, deps } = fakeDeps();
    db.query = vi.fn(async () => {
      throw new Error('connection refused');
    }) as unknown as Db['query'];

    await expect(seedDemoCommand({ DATABASE_URL: LOCAL_URL }, deps)).rejects.toThrow(
      'connection refused'
    );
    expect(db.end).toHaveBeenCalled();
  });
});

describe('seedDemo with PostgreSQL', () => {
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  let client: pg.PoolClient | undefined;

  // Each test runs inside a transaction that is rolled back, so the seed leaves nothing behind.
  beforeEach(async () => {
    client = await pool.connect();
    await client.query('begin');
  });
  afterEach(async () => {
    try {
      await client?.query('rollback');
    } finally {
      client?.release();
      client = undefined;
    }
  });
  afterAll(() => pool.end());

  async function countReports(origin: string, destination: string) {
    const { rows } = await client!.query<{ recent: string; total: string }>(
      `select count(*) filter (where created_at > now() - make_interval(mins => $3)) as recent,
              count(*) as total
       from reports where origin = $1 and destination = $2`,
      [origin, destination, WINDOW_MINUTES]
    );
    return { recent: Number(rows[0].recent), total: Number(rows[0].total) };
  }

  it.each(DEMO_PAIRS)(
    'leaves $origin to $destination with its reports in the last 15 minutes',
    async ({ origin, destination, recent, old }) => {
      await seedDemo(client!);

      await expect(countReports(origin, destination)).resolves.toEqual({
        recent,
        total: recent + old
      });
    }
  );

  it('gives the same counts when it runs twice', async () => {
    await seedDemo(client!);
    const inserted = await seedDemo(client!);

    expect(inserted).toBe(buildDemoReports().length);
    for (const { origin, destination, recent, old } of DEMO_PAIRS) {
      await expect(countReports(origin, destination)).resolves.toEqual({
        recent,
        total: recent + old
      });
    }
  });

  it('keeps the reports of the other pairs', async () => {
    await client!.query(
      `insert into reports (origin, destination, type) values ('plaza', 'bnc', 'no_sale')`
    );

    await seedDemo(client!);

    await expect(countReports('plaza', 'bnc')).resolves.toEqual({ recent: 1, total: 1 });
  });
});
