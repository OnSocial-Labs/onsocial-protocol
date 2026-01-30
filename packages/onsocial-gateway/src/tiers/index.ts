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
 * Staking account info from the staking contract
 */
interface StakingAccount {
  locked_amount: string;
  unlock_at: string;
  lock_months: number;
  reward_per_token_paid: string;
  pending_rewards: string;
}

/**
 * Query staking account info from the staking contract
 * Returns locked amount, unlock time, and reward info
 */
async function getStakingAccount(accountId: string): Promise<StakingAccount | null> {
  try {
    const rpc = getProvider();

    const result = await rpc.query({
      request_type: 'call_function',
      account_id: config.stakingContract,
      method_name: 'get_account',
      args_base64: Buffer.from(
        JSON.stringify({ account_id: accountId })
      ).toString('base64'),
      finality: 'final',
    });

    if ('result' in result && Array.isArray(result.result)) {
      const responseStr = Buffer.from(result.result).toString('utf-8');
      return JSON.parse(responseStr) as StakingAccount;
    }

    return null;
  } catch (error) {
    console.error(`Failed to get staking account for ${accountId}:`, error);
    return null;
  }
}

/**
 * Calculate tier based on USD value at stake time.
 * 
 * ARCHITECTURE: The staking contract is price-agnostic - it only stores
 * token amounts. The USD value and tier assignment are calculated by:
 * 
 * 1. At stake time: Gateway/indexer fetches current SOCIAL price, calculates
 *    USD value, and stores tier assignment in the indexer database.
 * 
 * 2. At query time (this function): We check the staking contract for locked
 *    amount and query the indexer for the tier assigned at stake time.
 * 
 * This design avoids storing price-sensitive data in the contract, which
 * would create risks when the SOCIAL token has no liquidity/oracle yet.
 * 
 * TODO: Phase 2 - Query indexer/database for tier assigned at stake time
 * For now, we use a simple threshold check on locked amount as placeholder.
 */
function calculateTier(lockedAmount: bigint): Tier {
  // TODO: Query indexer for tier assigned at stake time
  // For now, use simple threshold as placeholder
  if (lockedAmount >= config.tierThresholds.builder) {
    return 'builder';
  }
  if (lockedAmount >= config.tierThresholds.staker) {
    return 'staker';
  }
  return 'free';
}

/**
 * Get tier info for an account (with caching)
 * 
 * Queries the staking contract for locked amount and calculates tier.
 * In Phase 2, this will also query the indexer for the tier assigned
 * at stake time based on USD value.
 */
export async function getTierInfo(accountId: string): Promise<TierInfo> {
  const now = Date.now();

  // Check cache
  const cached = tierCache.get(accountId);
  if (cached && cached.expiresAt > now) {
    return cached.info;
  }

  // Fetch staking account info
  const stakingAccount = await getStakingAccount(accountId);
  const lockedAmount = stakingAccount ? BigInt(stakingAccount.locked_amount) : BigInt(0);
  const tier = calculateTier(lockedAmount);

  const info: TierInfo = {
    tier,
    balance: lockedAmount.toString(), // Now represents locked/staked amount
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
