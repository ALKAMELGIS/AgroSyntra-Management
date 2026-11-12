import { Pool, QueryConfig, QueryResult, QueryResultRow, types } from 'pg';

// DATE columns come back as the plain 'YYYY-MM-DD' text. By default node-pg turns
// them into a JS Date at local midnight, which on a server set to UTC+4 (Dubai)
// serialises as the previous day (2026-11-12 → "2026-11-11T20:00:00.000Z").
// Code that reads dates already accepts both strings and Date objects.
export const PG_DATE_OID = 1082;
types.setTypeParser(PG_DATE_OID, (value: string) => value);
import * as Sentry from '@sentry/node';
import { databaseConfig } from '../config/database';
import { logger } from '../utils/logger';

const SLOW_QUERY_MS = 500;

const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: databaseConfig.url,
  min: databaseConfig.poolMin,
  max: databaseConfig.poolMax,
  idleTimeoutMillis: isProduction ? 60_000 : 30_000,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 30_000,
  query_timeout: 30_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected database pool error');
});

type QueryArg = string | QueryConfig;

function instrumentedQuery<R extends QueryResultRow = any>(
  textOrConfig: QueryArg,
  values?: any[],
): Promise<QueryResult<R>> {
  const start = Date.now();
  const text = typeof textOrConfig === 'string' ? textOrConfig : textOrConfig.text;

  return Sentry.startSpan(
    { name: 'db.query', op: 'db', attributes: { 'db.statement': text.substring(0, 200) } },
    async () => {
      const result = values
        ? await pool.query<R>(textOrConfig as string, values)
        : await pool.query<R>(textOrConfig);

      const duration = Date.now() - start;
      if (duration >= SLOW_QUERY_MS) {
        logger.warn(
          { duration, query: text.substring(0, 200), rows: result.rowCount },
          `Slow query (${duration}ms)`,
        );
        Sentry.addBreadcrumb({
          category: 'db',
          message: `Slow query (${duration}ms): ${text.substring(0, 100)}`,
          level: 'warning',
        });
      }
      return result;
    },
  );
}

export const dbPool = {
  query: instrumentedQuery,
  connect: () => pool.connect(),
  end: () => pool.end(),
  pool,
};
