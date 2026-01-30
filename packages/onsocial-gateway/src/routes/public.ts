import { Router, Request, Response } from 'express';
import db from '../db/index.js';
import { priceOracle } from '../services/price-oracle.js';
import { logger } from '../logger.js';
import { config } from '../config/index.js';

const router = Router();

// Track start time for uptime calculation
const startTime = Date.now();
const responseTimes: number[] = [];
const MAX_RESPONSE_SAMPLES = 100;

// Middleware to track response times
export function trackResponseTime(req: Request, res: Response, next: any) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    responseTimes.push(duration);
    if (responseTimes.length > MAX_RESPONSE_SAMPLES) {
      responseTimes.shift();
    }
  });
  next();
}

/**
 * GET /public/stats
 * Public platform statistics - no auth required
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    // Get credit system stats (gracefully handle db errors)
    let creditStats = { total_credits_sold: 0, unique_buyers: 0, total_usd_locked: 0 };
    try {
      creditStats = await db.getRevenueStats();
    } catch (dbError) {
      logger.warn({ dbError }, 'Failed to get credit stats from database');
    }
    
    // Get SOCIAL price
    const socialPrice = await priceOracle.getPrice();
    
    // Get platform stats from Hasura
    const platformStats = await getPlatformStats();
    
    // Calculate uptime in seconds
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    
    // Calculate average response time
    const avgResponseTime = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;
    
    res.json({
      platform: {
        totalPosts: platformStats.totalPosts || 0,
        totalUsers: platformStats.totalUsers || 0,
        totalGroups: platformStats.totalGroups || 0,
        last24h: platformStats.last24h || 0,
      },
      system: {
        status: 'operational',
        network: config.nearNetwork,
        version: '0.2.0',
        uptime: uptime,
        avgResponseTime: avgResponseTime,
      },
      credits: {
        totalPurchased: creditStats.total_credits_sold || 0,
        activeDevelopers: creditStats.unique_buyers || 0,
        socialPrice: socialPrice,
        totalLocked: creditStats.total_usd_locked || 0,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get public stats');
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

/**
 * Get platform stats from Hasura
 */
async function getPlatformStats() {
  try {
    const query = `
      query PlatformStats {
        posts_aggregate {
          aggregate {
            count
          }
        }
        accounts_aggregate {
          aggregate {
            count
          }
        }
        groups_aggregate {
          aggregate {
            count
          }
        }
        posts_aggregate_24h: posts_aggregate(
          where: { block_timestamp: { _gte: "now() - interval '24 hours'" } }
        ) {
          aggregate {
            count
          }
        }
      }
    `;

    const response = await fetch(config.hasuraUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.hasuraAdminSecret && {
          'x-hasura-admin-secret': config.hasuraAdminSecret,
        }),
      },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();
    
    return {
      totalPosts: data.data?.posts_aggregate?.aggregate?.count || 0,
      totalUsers: data.data?.accounts_aggregate?.aggregate?.count || 0,
      totalGroups: data.data?.groups_aggregate?.aggregate?.count || 0,
      last24h: data.data?.posts_aggregate_24h?.aggregate?.count || 0,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get platform stats from Hasura');
    return {
      totalPosts: 0,
      totalUsers: 0,
      totalGroups: 0,
      last24h: 0,
    };
  }
}

export { router as publicRouter };
