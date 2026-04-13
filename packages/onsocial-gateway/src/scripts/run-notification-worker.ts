#!/usr/bin/env node

import { Client } from 'pg';
import { logger } from '../logger.js';
import {
  NotificationWorker,
  logProcessingSummary,
} from '../services/notifications/worker.js';

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
    return 15_000;
  }

  const pollIntervalMs = Number.parseInt(rawValue, 10);
  return Number.isFinite(pollIntervalMs) && pollIntervalMs > 0
    ? pollIntervalMs
    : 15_000;
}

function isOnceMode(): boolean {
  return (
    process.argv.includes('--once') ||
    process.env.NOTIFICATION_WORKER_ONCE === 'true'
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
      databaseHost: new URL(databaseUrl).host,
    },
    'Notification worker started'
  );

  try {
    do {
      const results = await worker.runOnce();
      logProcessingSummary(results);

      if (once || stopRequested) {
        break;
      }

      await wait(pollIntervalMs);
    } while (!stopRequested);
  } finally {
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
