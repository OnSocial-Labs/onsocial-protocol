import { config } from '../config/index.js';
import { subscriptionStore } from '../services/revolut/index.js';
import { logger } from '../logger.js';
import type { Tier, TierInfo } from '../types/index.js';

// In-memory cache for tier lookups (simple TTL cache)
const tierCache = new Map<string, { info: TierInfo; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get tier info for an account (with caching).
 *
 * Queries the developer_subscriptions table for an active subscription.
 * Falls back to 'free' if no active subscription exists or if the lookup fails.
 */
export async function getTierInfo(accountId: string): Promise<TierInfo> {
  const now = Date.now();

  // Check cache
  const cached = tierCache.get(accountId);
  if (cached && cached.expiresAt > now) {
    return cached.info;
  }

  // Query subscription store for active subscription
  let tier: Tier = 'free';
  try {
    const sub = await subscriptionStore.getActiveByAccount(accountId);
    if (sub) {
      tier = sub.tier;
    }
  } catch (err) {
    logger.warn({ err, accountId }, 'Tier lookup failed, defaulting to free');
  }

  const info: TierInfo = {
    tier,
    rateLimit: config.rateLimits[tier],
  };

  // Cache result
  tierCache.set(accountId, {
    info,
    expiresAt: now + CACHE_TTL_MS,
  });

  return info;
}

/**
 * Clear tier cache for an account (useful after subscription changes)
 */
export function clearTierCache(accountId: string): void {
  tierCache.delete(accountId);
}

/**
 * Clear all tier cache
 */
export function clearAllTierCache(): void {
  tierCache.clear();
}
