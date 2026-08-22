#!/usr/bin/env node

/**
 * Emit OnSocial profile anniversary Activity rows for today (UTC).
 *
 *   pnpm --filter onsocial-gateway notifications:anniversary
 *   pnpm --filter onsocial-gateway notifications:anniversary -- --force
 */

import { Client } from 'pg';
import { logger } from '../logger.js';
import { emitProfileAnniversaries } from '../services/notifications/profile-anniversary.js';

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for profile anniversary emit');
  }
  return databaseUrl;
}

function isForceMode(): boolean {
  return process.argv.includes('--force');
}

async function main(): Promise<void> {
  const databaseUrl = requireDatabaseUrl();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const result = await emitProfileAnniversaries(client, {
      force: isForceMode(),
    });
    logger.info({ result }, 'Profile anniversary script finished');
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  logger.error(
    { error },
    error instanceof Error ? error.message : 'Profile anniversary script failed'
  );
  process.exit(1);
});
