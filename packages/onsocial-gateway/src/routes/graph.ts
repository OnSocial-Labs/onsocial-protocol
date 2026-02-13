import { Router } from 'express';
import type { Request, Response } from 'express';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { requireAuth } from '../middleware/index.js';
import { queryValidationMiddleware, QUERY_LIMITS } from '../middleware/queryValidation.js';
import type { Tier } from '../types/index.js';

export const graphRouter = Router();

// Health check registered BEFORE auth middleware — must stay public for Docker/Caddy probes
graphRouter.get('/health', async (_req: Request, res: Response) => {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.hasuraAdminSecret) {
      headers['x-hasura-admin-secret'] = config.hasuraAdminSecret;
    }

    const response = await fetch(config.hasuraUrl, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(5_000),
      body: JSON.stringify({ query: '{ __typename }' }),
    });

    if (response.ok) {
      res.json({ status: 'ok', hasura: 'connected' });
    } else {
      res.status(502).json({ status: 'error', hasura: 'unhealthy' });
    }
  } catch (error) {
    logger.error({ error }, 'Hasura health check error');
    res.status(502).json({ status: 'error', hasura: 'unreachable' });
  }
});

// All remaining graph routes require JWT — tier controls query depth, complexity, and row limits
graphRouter.use(requireAuth);
graphRouter.use(queryValidationMiddleware);

/**
 * GET /graph/limits
 * Return query limits for the current tier
 */
graphRouter.get('/limits', (req: Request, res: Response) => {
  const tier: Tier = req.auth!.tier || 'free';
  res.json({
    tier,
    limits: QUERY_LIMITS[tier],
    allTiers: QUERY_LIMITS,
  });
});

/**
 * POST /graph/query
 * Proxy GraphQL queries to Hasura
 *
 * Body: {
 *   query: string,
 *   variables?: object,
 *   operationName?: string
 * }
 */
graphRouter.post('/query', async (req: Request, res: Response) => {
  const { query, variables, operationName } = req.body;

  if (!query) {
    res.status(400).json({ error: 'Missing query' });
    return;
  }

  // Hasura role = user's tier. Admin secret authenticates the gateway service;
  // x-hasura-role scopes the query to the user's tier permissions.
  const tier: Tier = req.auth!.tier || 'free';

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-hasura-role': tier,
      'x-hasura-user-id': req.auth!.accountId,
    };

    if (config.hasuraAdminSecret) {
      headers['x-hasura-admin-secret'] = config.hasuraAdminSecret;
    }

    const response = await fetch(config.hasuraUrl, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        query,
        variables,
        operationName,
      }),
    });

    const data = await response.json();

    // Hasura returns 200 even for errors, forward as-is
    res.status(response.status).json(data);
  } catch (error) {
    logger.error({ error }, 'Graph query error');
    res.status(502).json({ error: 'Failed to query graph' });
  }
});

/**
 * POST /graph/subscription
 * WebSocket upgrade endpoint for GraphQL subscriptions
 * Note: This is a placeholder - real subscriptions need ws upgrade
 */
graphRouter.get('/subscription', (_req: Request, res: Response) => {
  res.status(501).json({
    error: 'WebSocket subscriptions not yet implemented',
    hint: 'Use direct Hasura connection for subscriptions',
  });
});
