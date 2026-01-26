import { Router } from 'express';
import type { Request, Response } from 'express';
import { config } from '../config/index.js';
import { queryValidationMiddleware, QUERY_LIMITS } from '../middleware/queryValidation.js';
import type { Tier } from '../types/index.js';

export const graphRouter = Router();

// Apply query validation to all graph routes
graphRouter.use(queryValidationMiddleware);

/**
 * GET /graph/limits
 * Return query limits for the current tier
 */
graphRouter.get('/limits', (req: Request, res: Response) => {
  const tier: Tier = req.auth?.tier || 'free';
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

  const tier: Tier = req.auth?.tier || 'free';

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Use role-based permissions (production mode)
    // Admin secret only used as fallback when roles not configured
    if (config.hasuraAdminSecret) {
      headers['x-hasura-admin-secret'] = config.hasuraAdminSecret;
      // Also set role headers - Hasura applies role permissions even with admin secret
      // when x-hasura-role is present
      headers['x-hasura-role'] = tier;
      if (req.auth) {
        headers['x-hasura-user-id'] = req.auth.accountId;
      }
    } else {
      // Without admin secret, rely purely on role headers
      headers['x-hasura-role'] = tier;
      if (req.auth) {
        headers['x-hasura-user-id'] = req.auth.accountId;
      }
    }

    const response = await fetch(config.hasuraUrl, {
      method: 'POST',
      headers,
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
    console.error('Graph query error:', error);
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

/**
 * GET /graph/health
 * Check Hasura connection health
 */
graphRouter.get('/health', async (_req: Request, res: Response) => {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.hasuraAdminSecret) {
      headers['x-hasura-admin-secret'] = config.hasuraAdminSecret;
    }

    const response = await fetch(config.hasuraUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: '{ __typename }',
      }),
    });

    if (response.ok) {
      res.json({ status: 'ok', hasura: 'connected' });
    } else {
      res.status(502).json({ status: 'error', hasura: 'unhealthy' });
    }
  } catch (error) {
    console.error('Hasura health check error:', error);
    res.status(502).json({ status: 'error', hasura: 'unreachable' });
  }
});
