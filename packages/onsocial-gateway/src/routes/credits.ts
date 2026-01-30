import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { priceOracle } from '../services/price-oracle.js';
import { logger } from '../logger.js';

const router = Router();

/**
 * GET /credits/balance
 * Get developer's credit balance and stats
 */
router.get('/balance', async (req: Request, res: Response) => {
  try {
    if (!req.auth?.accountId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const dev = await db.getDeveloper(req.auth.accountId);
    const stats = await db.getDeveloperStats(req.auth.accountId, 30);

    res.json({
      accountId: dev.account_id,
      credits: dev.credit_balance,
      tier: dev.tier,
      lockedUsdValue: dev.locked_usd_value,
      freeWrites: {
        used: dev.free_writes_used,
        limit: getFreeWriteLimit(dev.tier),
        resetAt: dev.free_writes_reset_at,
      },
      stats: {
        last30Days: {
          totalWrites: parseInt(stats.total_writes || '0'),
          creditsSpent: parseInt(stats.total_credits_spent || '0'),
          freeWritesUsed: parseInt(stats.free_writes_used || '0'),
          paidWrites: parseInt(stats.paid_writes || '0'),
          mbUploaded: parseFloat(stats.total_mb_uploaded || '0'),
        },
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get credit balance');
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

/**
 * GET /credits/history
 * Get credit purchase and usage history
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    if (!req.auth?.accountId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const days = parseInt(req.query.days as string) || 7;
    const breakdown = await db.getAppBreakdown(req.auth.accountId, days);

    res.json({
      period: `last${days}Days`,
      byApp: breakdown,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get credit history');
    res.status(500).json({ error: 'Failed to get history' });
  }
});

/**
 * GET /credits/price
 * Get current credit pricing
 */
router.get('/price', async (_req: Request, res: Response) => {
  try {
    const socialPriceUsd = await priceOracle.getPrice();
    const creditsPerSocial = priceOracle.getCreditsPerSocial(socialPriceUsd);

    res.json({
      socialPriceUsd,
      usdPerCredit: 0.01,
      creditsPerSocial,
      examples: {
        '1 SOCIAL': `${creditsPerSocial} credits`,
        '10 SOCIAL': `${creditsPerSocial * 10} credits`,
        '100 SOCIAL': `${creditsPerSocial * 100} credits`,
      },
      costs: {
        uploadPerMb: '1 credit ($0.01)',
        relayTx: '5 credits ($0.05)',
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get credit price');
    res.status(500).json({ error: 'Failed to get price' });
  }
});

/**
 * POST /credits/buy
 * Initiate credit purchase (returns instructions for ft_transfer_call)
 */
router.post('/buy', async (req: Request, res: Response) => {
  try {
    if (!req.auth?.accountId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { socialAmount } = req.body;
    if (!socialAmount || socialAmount <= 0) {
      res.status(400).json({ error: 'Invalid amount' });
      return;
    }

    const socialPriceUsd = await priceOracle.getPrice();
    const creditsPerSocial = priceOracle.getCreditsPerSocial(socialPriceUsd);
    const totalCredits = Math.floor(socialAmount * creditsPerSocial);

    // Return instructions for user to call ft_transfer_call
    res.json({
      instructions: {
        method: 'ft_transfer_call',
        contractId: process.env.SOCIAL_TOKEN_CONTRACT || 'social.testnet',
        args: {
          receiver_id: process.env.STAKING_CONTRACT || 'staking.onsocial.testnet',
          amount: (socialAmount * 1e24).toString(), // Convert to yocto
          msg: JSON.stringify({ action: 'credits' }),
        },
        deposit: '1', // 1 yoctoNEAR
        gas: '100000000000000', // 100 TGas
      },
      estimate: {
        socialAmount,
        socialPriceUsd,
        creditsPerSocial,
        totalCredits,
        usdValue: (totalCredits * 0.01).toFixed(2),
      },
      note: 'Credits will be added to your account after transaction confirms',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to prepare credit purchase');
    res.status(500).json({ error: 'Failed to prepare purchase' });
  }
});

/**
 * GET /credits/stats (admin/monitoring)
 * Platform-wide revenue stats
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await db.getRevenueStats();
    
    res.json({
      thisMonth: {
        totalCreditsSold: parseInt(stats.total_credits_sold || '0'),
        totalRevenueUsd: parseFloat(stats.total_revenue_usd || '0'),
        uniqueBuyers: parseInt(stats.unique_buyers || '0'),
        totalPurchases: parseInt(stats.total_purchases || '0'),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get credit stats');
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

function getFreeWriteLimit(tier: string): number {
  const limits: Record<string, number> = {
    free: 10,
    starter: 25,
    staker: 50,
    builder: 200,
    pro: 500,
  };
  return limits[tier] || 10;
}

export const creditsRouter = router;
