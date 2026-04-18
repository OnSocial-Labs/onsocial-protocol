#!/usr/bin/env node

import { Client } from 'pg';
import { logger } from '../logger.js';
import {
  NotificationWorker,
  logProcessingSummary,
} from '../services/notifications/worker.js';

const LISTEN_CHANNEL = 'idx_events';

/**
 * Source tables whose INSERTs should wake the worker immediately.
 */
const NOTIFY_TABLES = [
  'data_updates',
  'group_updates',
  'rewards_events',
  'boost_events',
  'scarces_events',
  'app_notification_events',
] as const;

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for the notification worker');
  }
  return databaseUrl;
}

function getBatchSize(): number {
  const rawValue = process.env.NOTIFICATION_WORKER_BATCH_SIZE;
  if (!rawValue) {
    return 250;
  }

  const batchSize = Number.parseInt(rawValue, 10);
  return Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 250;
}

function getPollIntervalMs(): number {
  const rawValue = process.env.NOTIFICATION_WORKER_POLL_INTERVAL_MS;
  if (!rawValue) {
    return 60_000; // 60s fallback — LISTEN/NOTIFY handles the fast path
  }

  const pollIntervalMs = Number.parseInt(rawValue, 10);
  return Number.isFinite(pollIntervalMs) && pollIntervalMs > 0
    ? pollIntervalMs
    : 60_000;
}

function isOnceMode(): boolean {
  return (
    process.argv.includes('--once') ||
    process.env.NOTIFICATION_WORKER_ONCE === 'true'
  );
}

// ── LISTEN/NOTIFY helpers ──────────────────────────────────────────────────

/**
 * Ensure a PG trigger function + per-table triggers exist so INSERTs fire
 * `pg_notify('idx_events', <table_name>)`.  Uses statement-level triggers
 * to avoid flooding on batch inserts.
 *
 * Idempotent — safe to call on every startup.
 */
async function ensureNotifyTriggers(client: Client): Promise<void> {
  await client.query(`
    CREATE OR REPLACE FUNCTION notify_idx_event() RETURNS trigger AS $$
    BEGIN
      PERFORM pg_notify('${LISTEN_CHANNEL}', TG_TABLE_NAME);
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  for (const table of NOTIFY_TABLES) {
    const triggerName = `idx_event_notify_${table}`;
    await client.query(`
      DROP TRIGGER IF EXISTS ${triggerName} ON ${table};
      CREATE TRIGGER ${triggerName}
        AFTER INSERT ON ${table}
        FOR EACH STATEMENT
        EXECUTE FUNCTION notify_idx_event();
    `);
  }

  logger.info(
    { tables: NOTIFY_TABLES.length, channel: LISTEN_CHANNEL },
    'LISTEN/NOTIFY triggers installed'
  );
}

/**
 * Create a dedicated listener client and subscribe to the channel.
 * Returns a `waitForEvent(timeoutMs)` function that resolves as soon as
 * a notification arrives OR the timeout expires.
 */
async function createListener(databaseUrl: string): Promise<{
  waitForEvent: (timeoutMs: number) => Promise<void>;
  close: () => Promise<void>;
}> {
  const listener = new Client({ connectionString: databaseUrl });
  await listener.connect();
  await listener.query(`LISTEN ${LISTEN_CHANNEL}`);

  // Shared state: resolve the current waiter when a notification fires
  let wakeUp: (() => void) | null = null;

  listener.on('notification', (msg) => {
    logger.debug({ table: msg.payload }, 'LISTEN/NOTIFY wake');
    if (wakeUp) {
      wakeUp();
      wakeUp = null;
    }
  });

  return {
    waitForEvent(timeoutMs: number): Promise<void> {
      return new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          wakeUp = null;
          resolve();
        }, timeoutMs);

        wakeUp = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    },
    async close() {
      await listener.end();
    },
  };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const databaseUrl = requireDatabaseUrl();
  const client = new Client({ connectionString: databaseUrl });
  const batchSize = getBatchSize();
  const pollIntervalMs = getPollIntervalMs();
  const once = isOnceMode();
  let stopRequested = false;

  await client.connect();

  const worker = new NotificationWorker(client, { batchSize });
  const lockAcquired = await worker.acquireLock();
  if (!lockAcquired) {
    throw new Error(
      'Notification worker lock is already held by another process'
    );
  }

  // Install LISTEN/NOTIFY triggers (idempotent)
  await ensureNotifyTriggers(client);

  // Create a dedicated listener client (separate from the transaction client)
  const { waitForEvent, close: closeListener } =
    await createListener(databaseUrl);

  const requestStop = (signal: string) => {
    stopRequested = true;
    logger.info({ signal }, 'Notification worker stop requested');
  };

  process.on('SIGTERM', () => requestStop('SIGTERM'));
  process.on('SIGINT', () => requestStop('SIGINT'));

  logger.info(
    {
      batchSize,
      pollIntervalMs,
      once,
      listenChannel: LISTEN_CHANNEL,
      databaseHost: new URL(databaseUrl).host,
    },
    'Notification worker started (LISTEN/NOTIFY mode)'
  );

  try {
    do {
      const results = await worker.runOnce();
      logProcessingSummary(results);

      if (once || stopRequested) {
        break;
      }

      // Wait for a LISTEN notification OR the fallback poll interval
      await waitForEvent(pollIntervalMs);
    } while (!stopRequested);
  } finally {
    await closeListener().catch(() => {});
    await worker.releaseLock().catch((error: unknown) => {
      logger.warn(
        { error },
        'Failed to release notification worker advisory lock'
      );
    });
    await client.end();
  }
}

main().catch((error: unknown) => {
  logger.error(
    { error },
    error instanceof Error ? error.message : 'Notification worker failed'
  );
  process.exit(1);
});
