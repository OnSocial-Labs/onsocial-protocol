import { logger } from '../logger.js';

/**
 * Price oracle service
 * 
 * Testnet: Returns mocked price ($0.10)
 * Mainnet: Swap to CoinGecko API or pool AMM
 */

interface PriceCache {
  price: number;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const TESTNET_MOCK_PRICE = 0.10; // $0.10 for testnet
const MAINNET_MODE = process.env.PRICE_ORACLE_MODE === 'mainnet';

let priceCache: PriceCache | null = null;

export const priceOracle = {
  /**
   * Get current SOCIAL token price in USD
   */
  async getPrice(): Promise<number> {
    // Testnet mode: return mocked price
    if (!MAINNET_MODE) {
      logger.debug({ price: TESTNET_MOCK_PRICE }, 'Using testnet mock price');
      return TESTNET_MOCK_PRICE;
    }

    // Check cache
    if (priceCache && Date.now() - priceCache.timestamp < CACHE_TTL_MS) {
      logger.debug({ price: priceCache.price, cached: true }, 'Using cached price');
      return priceCache.price;
    }

    // Fetch fresh price (mainnet only)
    try {
      const price = await this.fetchPrice();
      priceCache = { price, timestamp: Date.now() };
      logger.info({ price }, 'Fetched fresh token price');
      return price;
    } catch (error) {
      logger.error({ error }, 'Failed to fetch price, using fallback');
      // Fallback to cached price if available
      if (priceCache) {
        return priceCache.price;
      }
      throw new Error('Price oracle unavailable and no cached price');
    }
  },

  /**
   * Fetch price from external source (mainnet only)
   */
  async fetchPrice(): Promise<number> {
    // TODO: Implement one of these strategies:
    
    // Option 1: CoinGecko API
    // const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=social-token&vs_currencies=usd');
    // const data = await response.json();
    // return data['social-token'].usd;

    // Option 2: Pool AMM (on-chain)
    // const poolPrice = await nearConnection.account(poolContractId).viewFunction({
    //   contractId: poolContractId,
    //   methodName: 'get_price',
    //   args: { token_in: 'social.near', token_out: 'usdc.near' }
    // });
    // return poolPrice;

    // Option 3: Manual config (emergency fallback)
    const manualPrice = parseFloat(process.env.SOCIAL_PRICE_USD || '0');
    if (manualPrice > 0) {
      return manualPrice;
    }

    throw new Error('No price source configured for mainnet');
  },

  /**
   * Calculate credits per SOCIAL token
   */
  getCreditsPerSocial(priceUsd: number): number {
    const USD_PER_CREDIT = 0.01; // $0.01 per credit (never changes)
    const credits = Math.floor(priceUsd / USD_PER_CREDIT);
    return Math.max(1, credits); // Minimum 1 credit per SOCIAL
  },

  /**
   * Clear price cache (for testing)
   */
  clearCache(): void {
    priceCache = null;
  },
};

export default priceOracle;
