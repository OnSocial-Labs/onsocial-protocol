import express from 'express';
import { pinoHttp } from 'pino-http';

import { config } from './config/index.js';
import { logger } from './logger.js';
import { webhookHandler, setupWebhook, startPolling } from './bot/index.js';
import { close as closeDb } from './db/index.js';

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(express.json());
app.use(pinoHttp({ logger }));

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'onsocial-backend', version: '0.1.0' });
});

// ---------------------------------------------------------------------------
// Telegram webhook (production: Caddy routes /webhooks/telegram here)
// ---------------------------------------------------------------------------

app.post('/webhooks/telegram', webhookHandler);

// ---------------------------------------------------------------------------
// 404 + error handlers
// ---------------------------------------------------------------------------

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    req.log.error({ err }, 'Unhandled error');
    res.status(500).json({ error: 'Internal server error' });
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const server = app.listen(config.port, async () => {
  logger.info(
    {
      port: config.port,
      network: config.nearNetwork,
      rewardsContract: config.rewardsContract,
      groups: config.telegramGroupIds,
    },
    'onsocial-backend started'
  );

  // Telegram: webhook in production, long-polling in dev
  if (config.nodeEnv === 'production') {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (webhookUrl) {
      await setupWebhook(webhookUrl);
    } else {
      logger.warn('WEBHOOK_URL not set — Telegram webhook not configured');
    }
  } else {
    await startPolling();
  }
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

const SHUTDOWN_TIMEOUT_MS = 15_000;

function shutdown(signal: string): void {
  logger.info({ signal }, 'Shutdown signal received, draining connections...');
  server.close(async () => {
    try {
      await closeDb();
    } catch (err) {
      logger.error({ err }, 'Error closing DB during shutdown');
    }
    logger.info('All connections drained. Exiting.');
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn('Shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled promise rejection — shutting down');
  shutdown('unhandledRejection');
});

export default app;
