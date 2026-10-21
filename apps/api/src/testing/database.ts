// Tests run against a real PostgreSQL: the one in compose.yaml locally, a service container in CI.
export const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://mcb:mcb@localhost:5432/mcb';
