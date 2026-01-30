import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { config } from './config/index.js';
import { logger } from './logger.js';
import { authMiddleware, rateLimitMiddleware } from './middleware/index.js';
import { creditCheckWrite } from './middleware/credits.js';
import { authRouter } from './routes/auth.js';
import { graphRouter } from './routes/graph.js';
import { relayRouter } from './routes/relay.js';
import { storageRouter } from './services/storage/index.js';
import { creditsRouter } from './routes/credits.js';
import { publicRouter, trackResponseTime } from './routes/public.js';
import { db } from './db/index.js';

const app = express();

// Security
app.use(helmet());
app.use(cors()); // Open CORS - rate limiting provides protection
app.use(express.json({ limit: '10mb' }));

// Logging
app.use(pinoHttp({ logger }));

// Response time tracking for /public/stats
app.use(trackResponseTime);

// Trust proxy (Fly.io, etc.)
app.set('trust proxy', 1);

// Public routes (no auth/rate limit needed)
app.use('/public', publicRouter);

// Health check (no auth needed)
app.get('/health', async (_req, res) => {
  const dbHealth = await db.healthCheck();
  res.json({
    status: dbHealth ? 'ok' : 'degraded',
    version: '0.2.0',
    services: ['auth', 'graph', 'storage', 'relay', 'credits'],
    database: dbHealth ? 'connected' : 'disconnected',
  });
});

// Auth middleware (parses JWT, attaches to req.auth)
app.use(authMiddleware);

// Rate limiting (tier-based)
app.use(rateLimitMiddleware);

// Credit check for writes (uploads/relays)
app.use(creditCheckWrite);

// Routes
app.use('/auth', authRouter);
app.use('/graph', graphRouter);
app.use('/storage', storageRouter);
app.use('/relay', relayRouter);
app.use('/credits', creditsRouter);

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

app.listen(config.port, () => {
  logger.info(
    {
      port: config.port,
      network: config.nearNetwork,
      hasura: config.hasuraUrl,
    },
    'onsocial-gateway started'
  );
});

export default app;
