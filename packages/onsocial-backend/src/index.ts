import express from 'express';
import { pinoHttp } from 'pino-http';

import { config } from './config/index.js';
import { logger } from './logger.js';
import { webhookHandler, setupWebhook, startPolling } from './bot/index.js';
import { close as closeDb } from './db/index.js';
import partnerRoutes from './routes/partner.js';
import partnerGovernanceRoutes from './routes/partner-governance.js';
import { initPartnerKeyCache } from './middleware/partnerAuth.js';

const app = express();

function resolveWebhookUrl(): string | null {
  const configuredWebhookUrl = process.env.WEBHOOK_URL?.trim();
  if (configuredWebhookUrl) {
    return configuredWebhookUrl;
  }

  const publicDomain = process.env.PUBLIC_DOMAIN?.trim();
  if (!publicDomain) {
    return null;
  }

  const normalizedDomain = publicDomain
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  if (!normalizedDomain) {
    return null;
  }

  return `https://${normalizedDomain}/webhooks/telegram`;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// CORS — allow portal (localhost + production) to call the API
app.use((req, res, next) => {
  const origin = req.headers.origin ?? '';
  const allowed = [
    'http://localhost:3000',
    'https://testnet.onsocial.id',
    'https://portal.onsocial.id',
    'https://onsocial.id',
  ];
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

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
// Partner Rewards API (SDK consumers)
// ---------------------------------------------------------------------------

// Partner governance routes MUST be registered before SDK partner routes, because
// partnerRoutes applies partnerAuth to all /v1/* sub-routes.
app.use('/v1/partners', partnerGovernanceRoutes);
app.use('/v1', partnerRoutes);

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

  // Pre-warm partner API key cache
  await initPartnerKeyCache();

  // Telegram: webhook in production, long-polling in dev
  if (config.nodeEnv === 'production') {
    const webhookUrl = resolveWebhookUrl();
    if (webhookUrl) {
      await setupWebhook(webhookUrl);
    } else {
      logger.warn(
        'WEBHOOK_URL/PUBLIC_DOMAIN not set — Telegram webhook not configured'
      );
    }
  } else if (process.env.SKIP_BOT) {
    logger.info('SKIP_BOT set — running API server only (no Telegram polling)');
  } else {
    try {
      await startPolling();
    } catch (err) {
      logger.warn({ err }, 'Telegram bot polling failed (non-fatal in dev)');
    }
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
