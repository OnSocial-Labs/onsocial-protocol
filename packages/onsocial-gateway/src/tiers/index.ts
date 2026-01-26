import { JsonRpcProvider } from 'near-api-js';
import { config } from '../config/index.js';
import type { Tier, TierInfo } from '../types/index.js';

// In-memory cache for tier lookups (simple TTL cache)
const tierCache = new Map<string, { info: TierInfo; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// RPC provider for NEAR queries
let provider: JsonRpcProvider | null = null;

function getProvider(): JsonRpcProvider {
  if (!provider) {
    provider = new JsonRpcProvider({ url: config.nearRpcUrl });
  }
  return provider;
}

/**
 * Query SOCIAL token balance for an account
 * Uses NEP-141 ft_balance_of standard via direct RPC call
 */
async function getTokenBalance(accountId: string): Promise<bigint> {
  try {
    const rpc = getProvider();

    // Use call_function RPC method for view calls
    const result = await rpc.query({
      request_type: 'call_function',
      account_id: config.socialTokenContract,
      method_name: 'ft_balance_of',
      args_base64: Buffer.from(
        JSON.stringify({ account_id: accountId })
      ).toString('base64'),
      finality: 'final',
    });

    // Parse the result (comes as array of bytes)
    if ('result' in result && Array.isArray(result.result)) {
      const responseStr = Buffer.from(result.result).toString('utf-8');
      // Remove quotes from JSON string response
      const balance = responseStr.replace(/"/g, '');
      return BigInt(balance || '0');
    }

    return BigInt(0);
  } catch (error) {
    console.error(`Failed to get balance for ${accountId}:`, error);
    return BigInt(0);
  }
}

/**
 * Determine tier based on token balance
 * Phase 1: Simple balance check
 * Phase 2: Will add lock contract + USD oracle check
 */
function calculateTier(balance: bigint): Tier {
  if (balance >= config.tierThresholds.builder) {
    return 'builder';
  }
  if (balance >= config.tierThresholds.staker) {
    return 'staker';
  }
  return 'free';
}

/**
 * Get tier info for an account (with caching)
 */
export async function getTierInfo(accountId: string): Promise<TierInfo> {
  const now = Date.now();

  // Check cache
  const cached = tierCache.get(accountId);
  if (cached && cached.expiresAt > now) {
    return cached.info;
  }

  // Fetch fresh data
  const balance = await getTokenBalance(accountId);
  const tier = calculateTier(balance);

  const info: TierInfo = {
    tier,
    balance: balance.toString(),
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
 * Clear tier cache for an account (useful after token transfers)
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
