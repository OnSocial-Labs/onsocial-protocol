import { config } from '../config/index.js';
import { hasPaidAccess, subscriptionStore } from '../services/revolut/index.js';
import { logger } from '../logger.js';
import type { Tier, TierInfo } from '../types/index.js';

// In-memory cache for tier lookups (simple TTL cache)
const tierCache = new Map<string, { info: TierInfo; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Whether the given account is an admin wallet (receives `service` tier).
 */
export function isAdmin(accountId: string): boolean {
  return config.adminWallets.has(accountId.toLowerCase());
}

/**
 * Get tier info for an account (with caching).
 *
 * Admin wallets always receive the `service` tier.
 * Paid tiers require confirmed payment (`hasPaidAccess`) — pending
 * checkout never elevates rate limits. Grace tiers still apply during
 * upgrade/downgrade checkout so existing paid access is not dropped.
 * Falls back to 'free' if no paid subscription exists or if the lookup fails.
 */
export async function getTierInfo(accountId: string): Promise<TierInfo> {
  const now = Date.now();

  // Check cache
  const cached = tierCache.get(accountId);
  if (cached && cached.expiresAt > now) {
    return cached.info;
  }

  // Admin wallets always get service tier
  let tier: Tier = isAdmin(accountId) ? 'service' : 'free';

  // Non-admin: check subscription
  if (tier === 'free') {
    try {
      const sub = await subscriptionStore.getWithValidPeriod(accountId);
      if (sub) {
        if (hasPaidAccess(sub)) {
          tier = sub.tier;
        }
        // Honour grace during downgrade / mid-checkout so paid users are not
        // dropped to free while a new Revolut setup order is still pending.
        if (
          sub.graceTier &&
          sub.gracePeriodEnd &&
          new Date(sub.gracePeriodEnd) > new Date() &&
          config.rateLimits[sub.graceTier] > config.rateLimits[tier]
        ) {
          tier = sub.graceTier;
        }
      }
    } catch (err) {
      logger.warn({ err, accountId }, 'Tier lookup failed, defaulting to free');
    }
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
