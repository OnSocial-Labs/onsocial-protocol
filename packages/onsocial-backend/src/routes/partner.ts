// ---------------------------------------------------------------------------
// Partner API routes — /v1/reward, /v1/balance
// ---------------------------------------------------------------------------

import { Router } from 'express';
import type { Request, Response } from 'express';
import { partnerAuth } from '../middleware/partnerAuth.js';
import { claimOnChain, creditOnChain, viewContract } from '../services/near.js';
import { logger } from '../logger.js';

const router = Router();

// All partner routes require API key auth
router.use(partnerAuth);

// ---------------------------------------------------------------------------
// POST /v1/reward — credit a reward to a NEAR account
// ---------------------------------------------------------------------------

interface RewardBody {
  account_id: string;
  source: string;
  amount?: string;
}

router.post('/reward', async (req: Request, res: Response): Promise<void> => {
  const appId = (req as Request & { partnerAppId: string }).partnerAppId;
  const body = req.body as RewardBody;

  // Validate required fields
  if (!body.account_id || typeof body.account_id !== 'string') {
    res.status(400).json({ success: false, error: 'account_id is required' });
    return;
  }
  if (!body.source || typeof body.source !== 'string') {
    res.status(400).json({ success: false, error: 'source is required' });
    return;
  }

  try {
    // Build the action — mirrors what creditOnChain does internally
    const action: Record<string, string> = {
      type: 'credit_reward',
      account_id: body.account_id,
      source: body.source,
      app_id: appId,
    };
    if (body.amount) action.amount = body.amount;

    const txHash = await creditOnChain(
      body.account_id,
      body.amount || '0', // 0 = use on-chain default (reward_per_action)
      body.source,
      appId
    );

    res.json({
      success: true,
      tx_hash: txHash,
      app_id: appId,
      account_id: body.account_id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      { appId, accountId: body.account_id, error: msg },
      'Partner reward credit failed'
    );
    res.status(502).json({ success: false, error: msg });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/balance/:accountId — get user's claimable balance
// ---------------------------------------------------------------------------

router.get(
  '/balance/:accountId',
  async (req: Request, res: Response): Promise<void> => {
    const { accountId } = req.params;
    const appId = (req as Request & { partnerAppId: string }).partnerAppId;

    try {
      const [claimable, appReward] = await Promise.all([
        viewContract('get_claimable', { account_id: accountId }),
        viewContract('get_user_app_reward', {
          account_id: accountId,
          app_id: appId,
        }),
      ]);

      res.json({
        success: true,
        account_id: accountId,
        app_id: appId,
        claimable,
        app_reward: appReward,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ success: false, error: msg });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /v1/app — get this app's on-chain config
// ---------------------------------------------------------------------------

router.get('/app', async (req: Request, res: Response): Promise<void> => {
  const appId = (req as Request & { partnerAppId: string }).partnerAppId;

  try {
    const config = await viewContract('get_app_config', { app_id: appId });
    res.json({ success: true, app_id: appId, config });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ success: false, error: msg });
  }
});

// ---------------------------------------------------------------------------
// POST /v1/claim — gasless claim of pending rewards for a user
// ---------------------------------------------------------------------------

router.post('/claim', async (req: Request, res: Response): Promise<void> => {
  const appId = (req as Request & { partnerAppId: string }).partnerAppId;
  const { account_id } = req.body as { account_id?: string };

  if (!account_id || typeof account_id !== 'string') {
    res.status(400).json({ success: false, error: 'account_id is required' });
    return;
  }

  try {
    // Check claimable balance first — skip if nothing to claim
    const claimable = await viewContract<string>('get_claimable', {
      account_id,
    });
    if (!claimable || claimable === '0') {
      res.json({
        success: true,
        claimed: '0',
        tx_hash: null,
        account_id,
        powered_by: `OnSocial stands with ${appId}`,
      });
      return;
    }

    // Execute gasless claim via relayer (intent auth)
    const result = await claimOnChain(account_id);
    if (!result.success) {
      res.status(502).json({ success: false, error: result.error });
      return;
    }

    // Fetch app label for branding
    const appConfig = await viewContract<{ label?: string } | null>(
      'get_app_config',
      { app_id: appId }
    );
    const label = appConfig?.label ?? appId;

    res.json({
      success: true,
      claimed: claimable,
      tx_hash: result.txHash,
      account_id,
      powered_by: `OnSocial stands with ${label}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      { appId, accountId: account_id, error: msg },
      'Partner claim failed'
    );
    res.status(502).json({ success: false, error: msg });
  }
});

export default router;
