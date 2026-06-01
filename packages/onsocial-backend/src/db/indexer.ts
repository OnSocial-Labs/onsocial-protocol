import pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../logger.js';

const { Pool } = pg;

export const indexerPool = new Pool({
  connectionString: config.indexerDatabaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

indexerPool.on('error', (err) => {
  logger.error({ err }, 'Unexpected indexer Postgres pool error');
});

/** Run a read query against the Substreams/indexer database. */
export async function indexerQuery<
  T extends pg.QueryResultRow = pg.QueryResultRow,
>(text: string, params?: unknown[]): Promise<pg.QueryResult<T>> {
  return indexerPool.query<T>(text, params);
}

export async function closeIndexer(): Promise<void> {
  await indexerPool.end();
}
