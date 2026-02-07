import { config } from '../config/index.js';
import { logger } from '../logger.js';

/**
 * Price oracle service
 *
 * Provides SOCIAL/USD price for the /auth/pricing endpoint.
 * NOT used on every request — only at login and tier pricing pages.
 *
 * Testnet: Returns config.socialPriceUsd ($0.10 default)
 * Mainnet: Queries Ref Finance pool for SOCIAL/USDC price, cached 5 min
 */

interface PriceCache {
  price: number;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAINNET_MODE = process.env.PRICE_ORACLE_MODE === 'mainnet';

let priceCache: PriceCache | null = null;

export const priceOracle = {
  /**
   * Get current SOCIAL token price in USD
   */
  async getPrice(): Promise<number> {
    // Testnet mode: return configured price
    if (!MAINNET_MODE) {
      return config.socialPriceUsd;
    }

    // Check cache
    if (priceCache && Date.now() - priceCache.timestamp < CACHE_TTL_MS) {
      return priceCache.price;
    }

    // Fetch fresh price (mainnet only)
    try {
      const price = await this.fetchRefPoolPrice();
      priceCache = { price, timestamp: Date.now() };
      logger.info({ price }, 'Fetched fresh SOCIAL price from Ref Finance');
      return price;
    } catch (error) {
      logger.error({ error }, 'Failed to fetch Ref price, using fallback');
      // Fallback to cached price or manual config
      if (priceCache) return priceCache.price;
      if (config.socialPriceUsd > 0) return config.socialPriceUsd;
      throw new Error('Price oracle unavailable and no fallback');
    }
  },

  /**
   * Query Ref Finance pool for SOCIAL/USDC price
   * Uses view-only RPC call — no transaction needed.
   */
  async fetchRefPoolPrice(): Promise<number> {
    const poolId = config.refPoolId;
    if (!poolId) {
      throw new Error('REF_POOL_ID not configured');
    }

    const res = await fetch(config.nearRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'price',
        method: 'query',
        params: {
          request_type: 'call_function',
          account_id: 'v2.ref-finance.near',
          method_name: 'get_pool',
          args_base64: Buffer.from(JSON.stringify({ pool_id: poolId })).toString('base64'),
          finality: 'final',
        },
      }),
    });

    const json = (await res.json()) as any;
    if (json.error) throw new Error(json.error.message);

    const resultBytes = json.result?.result;
    if (!resultBytes) throw new Error('Empty RPC result');

    const pool = JSON.parse(Buffer.from(resultBytes).toString('utf-8'));
    // Simple pool: amounts[0] / amounts[1] gives relative price
    // Actual calculation depends on pool type (SimplePool vs StablePool)
    const [amountSocial, amountUsdc] = pool.amounts.map(Number);
    if (!amountSocial || !amountUsdc) throw new Error('Empty pool');

    // USDC has 6 decimals, SOCIAL has 24 decimals
    const price = (amountUsdc / 1e6) / (amountSocial / 1e24);
    return price;
  },

  /**
   * Calculate SOCIAL tokens needed for a given USD amount
   */
  async socialForUsd(usd: number): Promise<number> {
    const price = await this.getPrice();
    return Math.ceil(usd / price);
  },

  /**
   * Clear price cache (for testing)
   */
  clearCache(): void {
    priceCache = null;
  },
};

export default priceOracle;
