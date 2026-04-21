import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/index.js';
import { isAdmin } from '../tiers/index.js';
import {
  type AnalyticsDrilldownStream,
  getAnalyticsDrilldown,
  getAnalyticsOverview,
} from '../services/analytics/index.js';

export const analyticsRouter = Router();
const MAX_DRILLDOWN_ROUTE_LIMIT = 60;

const VALID_DRILLDOWN_STREAMS = new Set<AnalyticsDrilldownStream>([
  'all',
  'posts',
  'reactions',
  'claims',
  'groups',
  'permissions',
  'contracts',
]);

function parsePartitionId(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function parseStream(value: unknown): AnalyticsDrilldownStream | null {
  if (value == null || value === '') return 'all';
  if (typeof value !== 'string') return null;
  return VALID_DRILLDOWN_STREAMS.has(value as AnalyticsDrilldownStream)
    ? (value as AnalyticsDrilldownStream)
    : null;
}

function parseLimit(value: unknown): number | null {
  if (value == null || value === '') return 12;
  if (typeof value !== 'string') return null;
  const parsed = Number.parseInt(value, 10);
  if (
    !Number.isFinite(parsed) ||
    parsed < 1 ||
    parsed > MAX_DRILLDOWN_ROUTE_LIMIT
  ) {
    return null;
  }
  return parsed;
}

function canAccessInternalAnalytics(req: Request): boolean {
  const auth = req.auth;
  if (!auth) return false;
  return auth.tier === 'service' || isAdmin(auth.accountId);
}

analyticsRouter.get(
  '/analytics/overview',
  requireAuth,
  async (req: Request, res: Response) => {
    if (!canAccessInternalAnalytics(req)) {
      res.status(403).json({ error: 'Internal analytics access required' });
      return;
    }

    try {
      const overview = await getAnalyticsOverview(req.auth!.accountId);
      res.json(overview);
    } catch (error) {
      req.log.error({ error }, 'Failed to load analytics overview');
      res.status(502).json({ error: 'Failed to load analytics overview' });
    }
  }
);

analyticsRouter.get(
  '/analytics/drilldown',
  requireAuth,
  async (req: Request, res: Response) => {
    if (!canAccessInternalAnalytics(req)) {
      res.status(403).json({ error: 'Internal analytics access required' });
      return;
    }

    const accountId =
      typeof req.query.accountId === 'string' ? req.query.accountId.trim() : '';
    const partitionId = parsePartitionId(req.query.partitionId);
    const stream = parseStream(req.query.stream);
    const limit = parseLimit(req.query.limit);
    const hasAccount = accountId.length > 0;
    const hasPartition = partitionId != null;

    if (stream == null) {
      res.status(400).json({
        error:
          'Invalid stream. Use all, posts, reactions, claims, groups, permissions, or contracts',
      });
      return;
    }

    if (limit == null) {
      res.status(400).json({
        error: `Invalid limit. Use an integer between 1 and ${MAX_DRILLDOWN_ROUTE_LIMIT}`,
      });
      return;
    }

    if (hasAccount === hasPartition) {
      res.status(400).json({
        error: 'Provide exactly one of accountId or partitionId',
      });
      return;
    }

    try {
      const drilldown = hasAccount
        ? await getAnalyticsDrilldown(
            req.auth!.accountId,
            {
              type: 'account',
              accountId,
            },
            stream,
            limit
          )
        : await getAnalyticsDrilldown(
            req.auth!.accountId,
            {
              type: 'partition',
              partitionId: partitionId!,
            },
            stream,
            limit
          );
      res.json(drilldown);
    } catch (error) {
      req.log.error({ error }, 'Failed to load analytics drilldown');
      res.status(502).json({ error: 'Failed to load analytics drilldown' });
    }
  }
);
