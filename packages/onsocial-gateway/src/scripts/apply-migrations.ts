#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');
const LOCK_ID = 3489132401;

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

async function applyMigration(
  client: Client,
  filename: string
): Promise<void> {
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