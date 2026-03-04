import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { pool } from './index.js';
import { logger } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Run all .sql migration files in order.
 * Uses a simple `schema_migrations` table to track applied migrations.
 */
async function migrate(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows: applied } = await client.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations ORDER BY filename'
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    // In production dist/db/migrations won't have .sql files — read from src
    const migrationsDir = fs.existsSync(MIGRATIONS_DIR)
      ? MIGRATIONS_DIR
      : path.resolve(__dirname, '../../src/db/migrations');

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (appliedSet.has(file)) continue;

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      logger.info({ file }, 'Applying migration');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        logger.info({ file }, 'Migration applied');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    logger.info('All migrations applied');
  } finally {
    client.release();
  }
}

// Run directly: node dist/db/migrate.js
migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.fatal({ err }, 'Migration failed');
    process.exit(1);
  });
