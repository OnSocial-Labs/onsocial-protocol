import { Router } from 'express';
import type { Request, Response } from 'express';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { requireAuth } from '../middleware/index.js';
import { getAnalyticsOverview } from '../services/analytics/index.js';
import {
  queryValidationMiddleware,
  QUERY_LIMITS,
} from '../middleware/queryValidation.js';
import type { Tier } from '../types/index.js';

export const graphRouter = Router();

const TOKEN_STATS_TTL_MS = 5 * 60 * 1000;

let cachedTokenStats: {
  holders: number;
  fetchedAt: number;
} | null = null;

const ANALYTICS_VIEWER_ACCOUNT_ID =
  config.nearNetwork === 'mainnet' ? 'onsocial.near' : 'onsocial.testnet';

// Health check registered BEFORE auth middleware — must stay public for Docker/Caddy probes
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

graphRouter.get('/token-stats', async (_req: Request, res: Response) => {
  if (
    cachedTokenStats &&
    Date.now() - cachedTokenStats.fetchedAt < TOKEN_STATS_TTL_MS
  ) {
    res.json({
      contract: config.socialTokenContract,
      holders: cachedTokenStats.holders,
      source: 'nearblocks',
      cached: true,
    });
    return;
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.nearblocksApiKey) {
      headers.Authorization = `Bearer ${config.nearblocksApiKey}`;
    }

    const response = await fetch(
      `${config.nearblocksApiUrl}/v1/fts/${config.socialTokenContract}/holders/count`,
      {
        headers,
        signal: AbortSignal.timeout(5_000),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      logger.error(
        { status: response.status, body },
        'Nearblocks token stats request failed'
      );
      res.status(502).json({ error: 'Failed to fetch token stats' });
      return;
    }

    const data = (await response.json()) as {
      holders?: Array<{ count?: string }>;
    };
    const holders = Number.parseInt(data.holders?.[0]?.count ?? '0', 10);

    cachedTokenStats = {
      holders: Number.isFinite(holders) ? holders : 0,
      fetchedAt: Date.now(),
    };

    res.json({
      contract: config.socialTokenContract,
      holders: cachedTokenStats.holders,
      source: 'nearblocks',
      cached: false,
    });
  } catch (error) {
    logger.error({ error }, 'Nearblocks token stats error');
    res.status(502).json({ error: 'Failed to fetch token stats' });
  }
});

graphRouter.get('/protocol-pulse', async (_req: Request, res: Response) => {
  try {
    const overview = await getAnalyticsOverview(ANALYTICS_VIEWER_ACCOUNT_ID);

    res.json({
      generatedAt: overview.generatedAt,
      windowHours: overview.windowHours,
      totals: {
        profiles: overview.totals.profiles,
        groups: overview.totals.groups,
      },
      recent24h: {
        posts: overview.recent24h.posts,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Protocol pulse stats error');
    res.status(502).json({ error: 'Failed to fetch protocol pulse' });
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
