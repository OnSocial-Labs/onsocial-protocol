/**
 * Utility to check if a token is supported by NEAR Intents
 * 
 * Tests if solvers can provide quotes for swapping a token.
 * No registration required - if token has liquidity on DEXs, it's supported.
 */

import { getQuote } from '../services/nearIntents';

interface TokenSupportResult {
  /** Is token supported by solvers? */
  supported: boolean;
  /** Error message if not supported */
  error?: string;
  /** Sample quote if supported */
  sampleQuote?: {
    amountIn: string;
    amountOut: string;
    rate: string;
  };
}

/**
 * Check if a token is supported by NEAR Intents solvers
 * 
 * @param tokenContractId - NEP-141 token contract (e.g., "social.tkn.near")
 * @param testAmount - Amount to test (in base units, default: 1 token)
 * @returns Support status and sample quote if available
 * 
 * @example
 * ```ts
 * const result = await checkTokenSupport('social.tkn.near');
 * if (result.supported) {
 *   console.log('SOCIAL token is supported!');
 *   console.log('Rate:', result.sampleQuote?.rate);
 * }
 * ```
 */
export async function checkTokenSupport(
  tokenContractId: string,
  testAmount: string = '1000000000000000000' // 1 token with 18 decimals
): Promise<TokenSupportResult> {
  try {
    // Request a test quote (dry run)
    const quote = await getQuote({
      dry: true, // Test mode - no actual swap
      swapType: 'EXACT_INPUT',
      originAsset: tokenContractId === 'near' ? 'near' : `nep141:${tokenContractId}`,
      destinationAsset: 'near',
      amount: testAmount,
      recipient: 'test.near', // Dummy recipient
      recipientType: 'INTENTS',
      refundTo: 'test.near',
      refundType: 'INTENTS',
      slippageTolerance: 100, // 1%
      deadline: new Date(Date.now() + 3600000).toISOString(),
    });

    // Calculate exchange rate
    const rate = (parseFloat(quote.amountOut) / parseFloat(quote.amountIn)).toFixed(6);

    return {
      supported: true,
      sampleQuote: {
        amountIn: quote.amountIn,
        amountOut: quote.amountOut,
        rate: `1 token = ${rate} NEAR`,
      },
    };
  } catch (error) {
    return {
      supported: false,
      error: error instanceof Error ? error.message : 'Token not supported by solvers',
    };
  }
}

/**
 * Check multiple tokens in parallel
 * 
 * @param tokenContractIds - Array of token contract IDs
 * @returns Map of token → support status
 * 
 * @example
 * ```ts
 * const results = await checkMultipleTokens([
 *   'social.tkn.near',
 *   'token.v2.ref-finance.near',
 *   'usdt.tether-token.near'
 * ]);
 * 
 * results.forEach((result, token) => {
 *   console.log(`${token}: ${result.supported ? '✅' : '❌'}`);
 * });
 * ```
 */
export async function checkMultipleTokens(
  tokenContractIds: string[]
): Promise<Map<string, TokenSupportResult>> {
  const results = await Promise.all(
    tokenContractIds.map(async (contractId) => ({
      contractId,
      result: await checkTokenSupport(contractId),
    }))
  );

  return new Map(results.map((r) => [r.contractId, r.result]));
}

/**
 * Filter supported tokens from a list
 * 
 * @param tokenContractIds - Array of token contract IDs to test
 * @returns Array of supported token contract IDs
 * 
 * @example
 * ```ts
 * const supported = await filterSupportedTokens([
 *   'social.tkn.near',
 *   'fake-token.near',
 *   'usdt.tether-token.near'
 * ]);
 * // Returns: ['social.tkn.near', 'usdt.tether-token.near']
 * ```
 */
export async function filterSupportedTokens(
  tokenContractIds: string[]
): Promise<string[]> {
  const results = await checkMultipleTokens(tokenContractIds);
  return tokenContractIds.filter((id) => results.get(id)?.supported);
}

/**
 * Get recommended tokens (filter config by actual support)
 * 
 * Use this to validate your SUPPORTED_TOKENS config against
 * real-time solver availability.
 * 
 * @example
 * ```ts
 * import { SUPPORTED_TOKENS } from '../config/supportedTokens';
 * 
 * const contractIds = SUPPORTED_TOKENS
 *   .filter(t => t.contractId) // Exclude native NEAR
 *   .map(t => t.contractId!);
 * 
 * const supported = await filterSupportedTokens(contractIds);
 * console.log('Actually supported tokens:', supported);
 * ```
 */
