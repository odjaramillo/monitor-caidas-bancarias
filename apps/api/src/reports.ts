import type { FastifyInstance } from 'fastify';
import type { Db } from './db.js';

// The closed list of failure types in docs/api.md. The bank list lives in the database (#4).
export const REPORT_TYPES = ['no_sale', 'sale_no_llega', 'error_app', 'punto_de_venta'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export interface NewReport {
  origin: string;
  destination: string;
  type: ReportType;
}

// PostgreSQL error code for a foreign key violation: the bank id is not in the banks table.
const FOREIGN_KEY_VIOLATION = '23503';
// Errors that mean the database did not answer, not that the query was wrong.
const UNREACHABLE_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND']);

const bankId = { type: 'string', minLength: 1, maxLength: 32 } as const;

const postReportSchema = {
  body: {
    type: 'object',
    required: ['origin', 'destination', 'type'],
    additionalProperties: false,
    properties: {
      origin: bankId,
      destination: bankId,
      type: { type: 'string', enum: REPORT_TYPES }
    }
  },
  response: {
    201: {
      type: 'object',
      required: ['id', 'origin', 'destination', 'type', 'createdAt'],
      properties: {
        id: { type: 'integer' },
        origin: { type: 'string' },
        destination: { type: 'string' },
        type: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' }
      }
    }
  }
} as const;

function errorCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
}

// True when the database did not answer: refused or dropped connection, or the pool timed out.
export function isUnreachable(err: unknown): boolean {
  const code = errorCode(err);
  if (code !== undefined && (UNREACHABLE_CODES.has(code) || code.startsWith('08'))) return true;
  return err instanceof Error && /timeout/i.test(err.message);
}

export async function saveReport(db: Db, report: NewReport) {
  const { rows } = await db.query<{ id: string; created_at: Date }>(
    'insert into reports (origin, destination, type) values ($1, $2, $3) returning id, created_at',
    [report.origin, report.destination, report.type]
  );
  // pg returns bigint columns as text; report ids stay far below 2^53.
  return { id: Number(rows[0].id), ...report, createdAt: rows[0].created_at };
}

export function reportRoutes(app: FastifyInstance, db: Db) {
  app.post<{ Body: NewReport }>('/reports', { schema: postReportSchema }, async (req, reply) => {
    try {
      const saved = await saveReport(db, req.body);
      return reply.code(201).send(saved);
    } catch (err) {
      if (errorCode(err) === FOREIGN_KEY_VIOLATION) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Unknown bank in origin or destination'
        });
      }
      if (isUnreachable(err)) {
        req.log.error({ err }, 'database unreachable while saving a report');
        return reply.code(503).send({
          statusCode: 503,
          error: 'Service Unavailable',
          message: 'Database unavailable, try again in a few seconds'
        });
      }
      throw err;
    }
  });
}
