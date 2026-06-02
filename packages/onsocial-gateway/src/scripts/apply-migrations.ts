#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');
const LOCK_ID = 3489132401;

/** Tables each migration is expected to create (for post–clean-deploy reconciliation). */
const TABLES_BY_MIGRATION: Record<string, string[]> = {
  '001_api_keys.sql': ['api_keys'],
  '002_api_usage.sql': ['api_usage'],
  '003_developer_subscriptions.sql': ['developer_subscriptions'],
  '004_subscription_pending_status.sql': ['developer_subscriptions'],
  '005_notifications.sql': [
    'notifications',
    'notification_counts',
    'notification_cursors',
  ],
  '006_notification_cursor_offsets.sql': ['notification_cursors'],
  '007_developer_apps.sql': ['developer_apps'],
  '008_notification_rules_and_webhooks.sql': [
    'developer_notification_rules',
    'notification_webhook_endpoints',
    'notification_delivery_attempts',
  ],
  '009_app_notification_events.sql': ['app_notification_events'],
};

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for gateway migrations');
  }
  return databaseUrl;
}

function getMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

async function ensureSchemaMigrationsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedFiles(client: Client): Promise<Set<string>> {
  const result = await client.query<{ filename: string }>(
    'SELECT filename FROM schema_migrations ORDER BY filename'
  );
  return new Set(result.rows.map((row: { filename: string }) => row.filename));
}

async function tableExists(
  client: Client,
  tableName: string
): Promise<boolean> {
  const result = await client.query<{ reg: string | null }>(
    `SELECT to_regclass($1) AS reg`,
    [`public.${tableName}`]
  );
  return result.rows[0]?.reg !== null;
}

/** Re-apply migrations whose tables were dropped (e.g. substreams clean deploy). */
async function reconcileOrphanedMigrations(
  client: Client,
  appliedFiles: Set<string>
): Promise<number> {
  let removed = 0;

  for (const filename of appliedFiles) {
    const tables = TABLES_BY_MIGRATION[filename];
    if (!tables?.length) continue;

    let missing = false;
    for (const table of tables) {
      if (!(await tableExists(client, table))) {
        missing = true;
        break;
      }
    }

    if (!missing) continue;

    await client.query('DELETE FROM schema_migrations WHERE filename = $1', [
      filename,
    ]);
    appliedFiles.delete(filename);
    removed++;
    console.warn(
      `⚠ ${filename} marked applied but table(s) missing — will re-apply`
    );
  }

  return removed;
}

async function applyMigration(client: Client, filename: string): Promise<void> {
  const filePath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filePath, 'utf8').trim();

  if (!sql) {
    console.log(`⏭ ${filename} (empty file)`);
    return;
  }

  console.log(`Applying ${filename}...`);
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(
      'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
      [filename]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  console.log(`✓ Applied ${filename}`);
}

async function main(): Promise<void> {
  const databaseUrl = requireDatabaseUrl();

  console.log('🚀 Gateway migration runner');
  console.log(`   Database URL host: ${new URL(databaseUrl).host}`);
  console.log(`   Migrations dir: ${MIGRATIONS_DIR}`);

  const client = new Client({
    connectionString: databaseUrl,
  });

  await client.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await ensureSchemaMigrationsTable(client);

    const files = getMigrationFiles();
    const appliedFiles = await getAppliedFiles(client);
    const reconciled = await reconcileOrphanedMigrations(client, appliedFiles);
    if (reconciled > 0) {
      console.log(`   Reconciled ${reconciled} orphaned migration record(s)`);
    }
    let appliedCount = 0;

    for (const file of files) {
      if (appliedFiles.has(file)) {
        console.log(`⏭ ${file} (already applied)`);
        continue;
      }

      await applyMigration(client, file);
      appliedCount++;
    }

    console.log(`✅ Gateway migrations complete (${appliedCount} applied)`);
  } finally {
    await client
      .query('SELECT pg_advisory_unlock($1)', [LOCK_ID])
      .catch((error: unknown) => {
        console.error(`⚠ Failed to release advisory lock: ${String(error)}`);
      });
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    `❌ Migration failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
