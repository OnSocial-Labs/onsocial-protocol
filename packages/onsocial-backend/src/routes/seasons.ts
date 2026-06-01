import { Router } from 'express';
import type { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';

import { config } from '../config/index.js';
import { logger } from '../logger.js';
import {
  finalizeSeasonZeroSettlement,
  getSeasonZeroClaimData,
  getSeasonZeroIndexedPoolYocto,
  getSeasonZeroOnChainConfig,
  getSeasonZeroSettlementSummary,
  publishSeasonZeroSettlement,
  SEASON_ZERO_SETTLEMENT_JOIN_MIN_YOCTO,
} from '../services/seasons/season-zero-finalization.js';
import {
  getSeasonZeroStandings,
  type SeasonZeroStanding,
} from '../services/seasons/season-zero-standings.js';
import { SEASON_ZERO_ID } from '../services/seasons/season-zero-policy.js';

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

function assertSeasonZero(req: Request, res: Response): boolean {
  if (req.params.seasonId === SEASON_ZERO_ID) return true;
  res.status(404).json({ success: false, error: 'Season not found' });
  return false;
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

router.get('/:seasonId/status', async (req: Request, res: Response) => {
  if (!assertSeasonZero(req, res)) return;

  try {
    const [onChainConfig, settlement, indexedPoolYocto] = await Promise.all([
      getSeasonZeroOnChainConfig(),
      getSeasonZeroSettlementSummary(),
      getSeasonZeroIndexedPoolYocto(),
    ]);
    res.json({
      success: true,
      seasonId: SEASON_ZERO_ID,
      joinMinYocto: SEASON_ZERO_SETTLEMENT_JOIN_MIN_YOCTO,
      onChainConfig,
      indexedPoolYocto,
      settlement,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'Season Zero status failed');
    res.status(502).json({
      success: false,
      error: 'Season status unavailable',
    });
  }
});

router.get('/:seasonId/standings', async (req: Request, res: Response) => {
  if (!assertSeasonZero(req, res)) return;

  try {
    const result = await getSeasonZeroStandings({
      limit: queryInt(req.query.limit, 50),
      offset: queryInt(req.query.offset, 0),
    });
    res.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'Season Zero standings failed');
    res.status(502).json({
      success: false,
      error: 'Season standings unavailable',
    });
  }
});

router.get('/:seasonId/me', async (req: Request, res: Response) => {
  if (!assertSeasonZero(req, res)) return;

  const accountId = normalizeAccountId(req.query.account_id);
  if (!accountId) {
    res.status(400).json({ success: false, error: 'account_id is required' });
    return;
  }

  try {
    const result = await getSeasonZeroStandings({
      limit: 1,
      offset: 0,
      accountId,
    });
    const standing: SeasonZeroStanding | null = result.standings[0] ?? null;
    res.json({
      success: true,
      seasonId: SEASON_ZERO_ID,
      accountId,
      standing,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      { error: message, accountId },
      'Season Zero account lookup failed'
    );
    res.status(502).json({
      success: false,
      error: 'Season account standing unavailable',
    });
  }
});

router.get('/:seasonId/settlement', async (req: Request, res: Response) => {
  if (!assertSeasonZero(req, res)) return;

  try {
    const settlement = await getSeasonZeroSettlementSummary();
    res.json({
      success: true,
      seasonId: SEASON_ZERO_ID,
      settlement,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'Season Zero settlement lookup failed');
    res.status(502).json({
      success: false,
      error: 'Season settlement unavailable',
    });
  }
});

router.get(
  '/:seasonId/claims/:accountId',
  async (req: Request, res: Response) => {
    if (!assertSeasonZero(req, res)) return;

    const accountId = normalizeAccountId(req.params.accountId);
    if (!accountId) {
      res.status(400).json({ success: false, error: 'account_id is invalid' });
      return;
    }

    try {
      const claim = await getSeasonZeroClaimData(accountId);
      res.json({
        success: true,
        seasonId: SEASON_ZERO_ID,
        accountId,
        claim,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: message, accountId },
        'Season Zero claim lookup failed'
      );
      res.status(502).json({
        success: false,
        error: 'Season claim unavailable',
      });
    }
  }
);

router.post('/:seasonId/finalize', async (req: Request, res: Response) => {
  if (!assertSeasonZero(req, res)) return;
  if (!requireSeasonAdmin(req, res)) return;

  const body = req.body as { cutoffTimestampNs?: unknown };
  const cutoffTimestampNs =
    typeof body.cutoffTimestampNs === 'string'
      ? body.cutoffTimestampNs.trim()
      : undefined;

  try {
    const settlement = await finalizeSeasonZeroSettlement({
      cutoffTimestampNs,
    });
    res.json({
      success: true,
      seasonId: SEASON_ZERO_ID,
      settlement,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'Season Zero finalization failed');
    res.status(400).json({
      success: false,
      error: message,
    });
  }
});

router.post(
  '/:seasonId/settlement/publish',
  async (req: Request, res: Response) => {
    if (!assertSeasonZero(req, res)) return;
    if (!requireSeasonAdmin(req, res)) return;

    const body = req.body as { active?: unknown };
    const active = typeof body.active === 'boolean' ? body.active : true;

    try {
      const settlement = await publishSeasonZeroSettlement({ active });
      res.json({
        success: true,
        seasonId: SEASON_ZERO_ID,
        settlement,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message }, 'Season Zero settlement publish failed');
      res.status(400).json({
        success: false,
        error: message,
      });
    }
  }
);

export default router;
