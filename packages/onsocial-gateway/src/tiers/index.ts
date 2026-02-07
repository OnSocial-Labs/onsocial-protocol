import { config } from '../config/index.js';
import type { Tier, TierInfo } from '../types/index.js';

// In-memory cache for tier lookups (simple TTL cache)
const tierCache = new Map<string, { info: TierInfo; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get tier info for an account (with caching)
 *
 * Phase 1: All authenticated users get 'free' tier (60 req/min).
 * Phase 2: Query indexed subscription table for 'pro' tier ($49/mo paid in SOCIAL).
 *
 * Staking is NOT used for tier assignment — it's for token holder rewards only.
 */
export async function getTierInfo(accountId: string): Promise<TierInfo> {
  const now = Date.now();

  // Check cache
  const cached = tierCache.get(accountId);
  if (cached && cached.expiresAt > now) {
    return cached.info;
  }

  // TODO Phase 2: query indexed DB for active pro subscription
  // e.g. SELECT tier FROM developer_subscriptions WHERE account_id = $1 AND expires_at > NOW()
  const tier: Tier = 'free';

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
