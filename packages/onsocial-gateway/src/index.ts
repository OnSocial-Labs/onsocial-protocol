import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { config } from './config/index.js';
import { logger } from './logger.js';
import { authMiddleware, rateLimitMiddleware } from './middleware/index.js';
import { authRouter } from './routes/auth.js';
import { graphRouter } from './routes/graph.js';
import { relayRouter } from './routes/relay.js';
import { storageRouter } from './services/storage/index.js';

const app = express();

// Security
app.use(helmet());
app.use(cors()); // Open CORS - rate limiting provides protection
app.use(express.json({ limit: '10mb' }));

// Logging
app.use(pinoHttp({ logger }));

// Trust proxy (Fly.io, etc.)
app.set('trust proxy', 1);

// Health check (no auth needed)
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '0.3.0',
    services: ['auth', 'graph', 'storage', 'relay'],
  });
});

// Auth middleware (parses JWT, attaches to req.auth)
app.use(authMiddleware);

// Rate limiting (tier-based: free 60/min, pro 600/min)
app.use(rateLimitMiddleware);

// Routes — 3 proxies + auth
app.use('/auth', authRouter);
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
