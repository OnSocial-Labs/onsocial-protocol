import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { config } from './config/index.js';
import { logger } from './logger.js';
import { authMiddleware, rateLimitMiddleware } from './middleware/index.js';
import { authRouter } from './routes/auth.js';
import { developerRouter } from './routes/developer.js';
import { graphRouter } from './routes/graph.js';
import { relayRouter } from './routes/relay.js';
import { storageRouter } from './services/storage/index.js';

const app = express();

// Security
app.use(helmet());
app.use(
  cors(
    config.corsOrigins === '*'
      ? undefined // default open CORS for dev
      : { origin: config.corsOrigins.split(',').map((s) => s.trim()) },
  ),
);
app.use(express.json({ limit: '10mb' }));

// Logging
app.use(pinoHttp({ logger }));

// Trust proxy (Caddy reverse proxy)
app.set('trust proxy', 1);

// Health check (no auth needed) — shallow ping
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '0.4.0',
    services: ['auth', 'developer', 'graph', 'storage', 'relay'],
  });
});

// Deep health check — verifies downstream dependencies
app.get('/health/ready', async (_req, res) => {
  const checks: Record<string, 'ok' | 'error'> = {};

  // Check Hasura
  try {
    const r = await fetch(config.hasuraUrl.replace('/v1/graphql', '/healthz'), {
      signal: AbortSignal.timeout(3000),
    });
    checks.hasura = r.ok ? 'ok' : 'error';
  } catch {
    checks.hasura = 'error';
  }

  // Check relayer
  try {
    const r = await fetch(`${config.relayUrl}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    checks.relayer = r.ok ? 'ok' : 'error';
  } catch {
    checks.relayer = 'error';
  }

  const allOk = Object.values(checks).every((v) => v === 'ok');
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ready' : 'degraded',
    checks,
  });
});

// Auth middleware (parses JWT, attaches to req.auth)
app.use(authMiddleware);

// Rate limiting (tier-based: free 60/min, pro 600/min, scale 3000/min)
app.use(rateLimitMiddleware);

// Routes — 3 proxies + auth + developer keys
app.use('/auth', authRouter);
app.use('/developer', developerRouter);
app.use('/graph', graphRouter);
app.use('/storage', storageRouter);
app.use('/relay', relayRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
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

// --- Start server with graceful shutdown ---

const server = app.listen(config.port, () => {
  logger.info(
    {
      port: config.port,
      network: config.nearNetwork,
      hasura: config.hasuraUrl,
    },
    'onsocial-gateway started',
  );
});

// Graceful shutdown — let in-flight requests finish
const SHUTDOWN_TIMEOUT_MS = 15_000;

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received, draining connections...');
  server.close(() => {
    logger.info('All connections drained. Exiting.');
    process.exit(0);
  });
  // Force exit if draining takes too long
  setTimeout(() => {
    logger.warn('Shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
