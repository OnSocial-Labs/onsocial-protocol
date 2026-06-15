import { Router } from 'express';
import type { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';

import { config } from '../config/index.js';
import { logger } from '../logger.js';
import {
  finalizeSeasonSettlement,
  getSeasonClaimData,
  getSeasonOnChainConfig,
  getSeasonPoolBreakdown,
  getSeasonSettlementSummary,
  previewSeasonSettlement,
  publishSeasonSettlement,
  SEASON_ZERO_SETTLEMENT_JOIN_MIN_YOCTO,
} from '../services/seasons/season-finalization.js';
import {
  loadSeasonRegistry,
  resolveActiveSeasonId,
} from '../services/seasons/season-registry-service.js';
import {
  getSeasonStandings,
  type SeasonZeroStanding,
} from '../services/seasons/season-standings.js';
import { normalizeSeasonId } from '../services/seasons/season-registry.js';

const router = Router();

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function queryInt(value: unknown, fallback: number): number {
  if (typeof value !== 'string') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeAccountId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const accountId = value.trim().toLowerCase();
  return ACCOUNT_ID_PATTERN.test(accountId) ? accountId : null;
}

function parseSeasonIdParam(req: Request, res: Response): string | null {
  const seasonId = normalizeSeasonId(req.params.seasonId);
  if (!seasonId) {
    res.status(400).json({ success: false, error: 'Invalid season id' });
    return null;
  }
  return seasonId;
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function requireSeasonAdmin(req: Request, res: Response): boolean {
  const expected = config.seasonSettlementAdminKey.trim();
  if (!expected) {
    res.status(503).json({
      success: false,
      error: 'Season settlement admin key is not configured',
    });
    return false;
  }
  const provided = (req.headers['x-admin-key']?.toString() ?? '').trim();
  if (!provided || !safeCompare(provided, expected)) {
    res.status(401).json({ success: false, error: 'Invalid admin key' });
    return false;
  }
  return true;
}

router.get('/registry', async (_req: Request, res: Response) => {
  try {
    const registry = await loadSeasonRegistry();
    res.json({ success: true, ...registry });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'Season registry failed');
    res.status(502).json({
      success: false,
      error: 'Season registry unavailable',
    });
  }
});

router.get('/active', async (_req: Request, res: Response) => {
  try {
    const seasonId = await resolveActiveSeasonId();
    const onChainConfig = await getSeasonOnChainConfig(seasonId);
    if (!onChainConfig) {
      res.status(404).json({
        success: false,
        error: 'Active season is not configured on-chain',
        seasonId,
      });
      return;
    }
    res.json({
      success: true,
      seasonId,
      onChainConfig,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'Active season lookup failed');
    res.status(502).json({
      success: false,
      error: 'Active season unavailable',
    });
  }
});

router.get('/:seasonId/status', async (req: Request, res: Response) => {
  const seasonId = parseSeasonIdParam(req, res);
  if (!seasonId) return;

  try {
    const onChainConfig = await getSeasonOnChainConfig(seasonId);
    const endsAtNs =
      onChainConfig && !onChainConfig.is_live && onChainConfig.ends_at_ns
        ? onChainConfig.ends_at_ns.toString()
        : undefined;
    const [settlement, poolBreakdown] = await Promise.all([
      getSeasonSettlementSummary(seasonId),
      getSeasonPoolBreakdown(
        seasonId,
        endsAtNs
          ? {
              joinCutoffTimestampNs: endsAtNs,
              sponsorCutoffTimestampNs: endsAtNs,
            }
          : {}
      ),
    ]);
    if (!onChainConfig) {
      res.status(404).json({
        success: false,
        error: 'Season not configured on-chain',
        seasonId,
      });
      return;
    }
    res.json({
      success: true,
      seasonId,
      joinMinYocto: SEASON_ZERO_SETTLEMENT_JOIN_MIN_YOCTO,
      onChainConfig,
      indexedPoolYocto: poolBreakdown.indexedPoolYocto,
      joinPoolYocto: poolBreakdown.joinPoolYocto,
      sponsoredPoolYocto: poolBreakdown.sponsoredPoolYocto,
      settlement,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, seasonId }, 'Season status failed');
    res.status(502).json({
      success: false,
      error: 'Season status unavailable',
    });
  }
});

router.get('/:seasonId/standings', async (req: Request, res: Response) => {
  const seasonId = parseSeasonIdParam(req, res);
  if (!seasonId) return;

  try {
    const cutoffTimestampNs =
      typeof req.query.cutoff_timestamp_ns === 'string'
        ? req.query.cutoff_timestamp_ns.trim()
        : undefined;
    const result = await getSeasonStandings(seasonId, {
      limit: queryInt(req.query.limit, 50),
      offset: queryInt(req.query.offset, 0),
      cutoffTimestampNs,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, seasonId }, 'Season standings failed');
    res.status(502).json({
      success: false,
      error: 'Season standings unavailable',
      detail: message,
    });
  }
});

router.get('/:seasonId/me', async (req: Request, res: Response) => {
  const seasonId = parseSeasonIdParam(req, res);
  if (!seasonId) return;

  const accountId = normalizeAccountId(req.query.account_id);
  if (!accountId) {
    res.status(400).json({ success: false, error: 'account_id is required' });
    return;
  }

  try {
    const onChainConfig = await getSeasonOnChainConfig(seasonId);
    const cutoffTimestampNs =
      onChainConfig && !onChainConfig.is_live && onChainConfig.ends_at_ns
        ? onChainConfig.ends_at_ns
        : undefined;
    const result = await getSeasonStandings(seasonId, {
      limit: 1,
      offset: 0,
      accountId,
      cutoffTimestampNs,
    });
    const standing: SeasonZeroStanding | null = result.standings[0] ?? null;
    res.json({
      success: true,
      seasonId,
      accountId,
      standing,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      { error: message, accountId, seasonId },
      'Season account lookup failed'
    );
    res.status(502).json({
      success: false,
      error: 'Season account standing unavailable',
    });
  }
});

router.get('/:seasonId/settlement', async (req: Request, res: Response) => {
  const seasonId = parseSeasonIdParam(req, res);
  if (!seasonId) return;

  try {
    const settlement = await getSeasonSettlementSummary(seasonId);
    res.json({
      success: true,
      seasonId,
      settlement,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      { error: message, seasonId },
      'Season settlement lookup failed'
    );
    res.status(502).json({
      success: false,
      error: 'Season settlement unavailable',
    });
  }
});

router.get(
  '/:seasonId/claims/:accountId',
  async (req: Request, res: Response) => {
    const seasonId = parseSeasonIdParam(req, res);
    if (!seasonId) return;

    const accountId = normalizeAccountId(req.params.accountId);
    if (!accountId) {
      res.status(400).json({ success: false, error: 'account_id is invalid' });
      return;
    }

    try {
      const claim = await getSeasonClaimData(seasonId, accountId);
      res.json({
        success: true,
        seasonId,
        accountId,
        claim,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: message, accountId, seasonId },
        'Season claim lookup failed'
      );
      res.status(502).json({
        success: false,
        error: 'Season claim unavailable',
      });
    }
  }
);

router.get(
  '/:seasonId/finalize/preview',
  async (req: Request, res: Response) => {
    const seasonId = parseSeasonIdParam(req, res);
    if (!seasonId) return;
    if (!requireSeasonAdmin(req, res)) return;

    const cutoffTimestampNs =
      typeof req.query.cutoff_timestamp_ns === 'string'
        ? req.query.cutoff_timestamp_ns.trim()
        : undefined;

    try {
      const preview = await previewSeasonSettlement(seasonId, {
        cutoffTimestampNs,
      });
      res.json({
        success: true,
        ...preview,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: message, seasonId },
        'Season finalize preview failed'
      );
      res.status(400).json({
        success: false,
        error: message,
      });
    }
  }
);

router.post('/:seasonId/finalize', async (req: Request, res: Response) => {
  const seasonId = parseSeasonIdParam(req, res);
  if (!seasonId) return;
  if (!requireSeasonAdmin(req, res)) return;

  const body = req.body as { cutoffTimestampNs?: unknown };
  const cutoffTimestampNs =
    typeof body.cutoffTimestampNs === 'string'
      ? body.cutoffTimestampNs.trim()
      : undefined;

  try {
    const settlement = await finalizeSeasonSettlement(seasonId, {
      cutoffTimestampNs,
    });
    res.json({
      success: true,
      seasonId,
      settlement,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, seasonId }, 'Season finalization failed');
    res.status(400).json({
      success: false,
      error: message,
    });
  }
});

router.post(
  '/:seasonId/settlement/publish',
  async (req: Request, res: Response) => {
    const seasonId = parseSeasonIdParam(req, res);
    if (!seasonId) return;
    if (!requireSeasonAdmin(req, res)) return;

    const body = req.body as { active?: unknown };
    const active = typeof body.active === 'boolean' ? body.active : true;

    try {
      const settlement = await publishSeasonSettlement(seasonId, { active });
      res.json({
        success: true,
        seasonId,
        settlement,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: message, seasonId },
        'Season settlement publish failed'
      );
      res.status(400).json({
        success: false,
        error: message,
      });
    }
  }
);

export default router;
