/**
 * Supported Tokens Configuration
 * 
 * Configuration for tokens supported by NEAR Intents.
 * Used for currency pricing and multi-token payments.
 * 
 * @module onsocial-intents/tokens
 */

import type { AssetId, TokenConfig } from './types';

/**
 * Supported tokens for NEAR Intents payments
 */
export const SUPPORTED_TOKENS: Record<string, TokenConfig> = {
  NEAR: {
    symbol: 'NEAR',
    assetId: 'nep141:wrap.near', // Use wNEAR for NEAR Intents swaps
    decimals: 24,
    name: 'NEAR Protocol',
    icon: 'Ⓝ',
  },
  USD: {
    symbol: 'USD',
    assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', // Native USDC on NEAR
    decimals: 6,
    name: 'US Dollar (via native USDC)',
    icon: '$',
    isStablecoin: true,
  },
  USDC: {
    symbol: 'USDC',
    assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', // Native USDC on NEAR
    decimals: 6,
    name: 'USD Coin (Native)',
    icon: '💵',
    isStablecoin: true,
  },
  USDT: {
    symbol: 'USDT',
    assetId: 'nep141:usdt.tether-token.near', // Native USDT on NEAR
    decimals: 6,
    name: 'Tether USD (Native)',
    icon: '💵',
    isStablecoin: true,
  },
  DAI: {
    symbol: 'DAI',
    assetId: 'nep141:6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near', // Bridged DAI
    decimals: 18,
    name: 'Dai Stablecoin (Bridged)',
    icon: '💵',
    isStablecoin: true,
  },
  SOCIAL: {
    symbol: 'SOCIAL',
    assetId: 'nep141:token.onsocial.near',
    decimals: 18,
    name: 'OnSocial Token',
    icon: '🎭',
  },
  // Note: EUR/EURC support depends on NEAR Intents solver availability
  // Check https://1click.chaindefuser.com/v0/tokens for current support
};

/**
 * Get asset ID for a currency code
 * 
 * @param currency - Currency code (NEAR, USD, USDC, SOCIAL, etc.)
 * @returns NEAR Intents asset ID
 * @throws Error if currency is not supported
 * 
 * @example
 * ```typescript
 * const usdcAsset = getCurrencyAsset('USDC');
 * // Returns: "nep141:usdc.e.near"
 * 
 * const nearAsset = getCurrencyAsset('NEAR');
 * // Returns: "near"
 * ```
 */
export function getCurrencyAsset(currency: string): AssetId {
  const normalized = currency.toUpperCase();
  const token = SUPPORTED_TOKENS[normalized];

  if (!token) {
    throw new Error(
      `Unsupported currency: ${currency}. Supported currencies: ${Object.keys(
        SUPPORTED_TOKENS
      ).join(', ')}`
    );
  }

  return token.assetId;
}

/**
 * Get token configuration by currency code
 * 
 * @param currency - Currency code
 * @returns Token configuration
 * @throws Error if currency is not supported
 * 
 * @example
 * ```typescript
 * const socialToken = getTokenConfig('SOCIAL');
 * console.log(socialToken.decimals); // 24
 * console.log(socialToken.name); // "OnSocial Token"
 * ```
 */
export function getTokenConfig(currency: string): TokenConfig {
  const normalized = currency.toUpperCase();
  const token = SUPPORTED_TOKENS[normalized];

  if (!token) {
    throw new Error(`Unsupported currency: ${currency}`);
  }

  return token;
}

/**
 * Format NEP-141 token contract ID as asset ID
 * 
 * @param contractId - NEP-141 token contract (e.g., "usdc.e.near")
 * @returns Formatted asset ID (e.g., "nep141:usdc.e.near")
 * 
 * @example
 * ```typescript
 * const assetId = formatNep141Asset('social.tkn.near');
 * // Returns: "nep141:social.tkn.near"
 * ```
 */
export function formatNep141Asset(contractId: string): AssetId {
  return `nep141:${contractId}`;
}

/**
 * Parse asset ID to get contract ID
 * 
 * @param assetId - NEAR Intents asset ID
 * @returns Contract ID or 'near' for native NEAR
 * 
 * @example
 * ```typescript
 * const contractId = parseAssetId('nep141:usdc.e.near');
 * // Returns: "usdc.e.near"
 * 
 * const nativeId = parseAssetId('near');
 * // Returns: "near"
 * ```
 */
export function parseAssetId(assetId: AssetId): string {
  if (assetId === 'near') {
    return 'near';
  }

  if (assetId.startsWith('nep141:')) {
    return assetId.substring(7);
  }

  if (assetId.startsWith('evm:')) {
    return assetId.substring(4);
  }

  return assetId;
}

/**
 * Check if an asset is a stablecoin
 * 
 * @param currency - Currency code
 * @returns Whether the currency is a stablecoin
 * 
 * @example
 * ```typescript
 * isStablecoin('USDC'); // true
 * isStablecoin('NEAR'); // false
 * ```
 */
export function isStablecoin(currency: string): boolean {
  try {
    const token = getTokenConfig(currency);
    return token.isStablecoin || false;
  } catch {
    return false;
  }
}

/**
 * Get all supported stablecoins
 * 
 * @returns Array of stablecoin currency codes
 * 
 * @example
 * ```typescript
 * const stablecoins = getStablecoins();
 * // Returns: ["USD", "USDC", "USDT", "DAI", "EUR", "EURC"]
 * ```
 */
export function getStablecoins(): string[] {
  return Object.entries(SUPPORTED_TOKENS)
    .filter(([_, token]) => token.isStablecoin)
    .map(([symbol, _]) => symbol);
}

/**
 * Convert NEAR amount to yoctoNEAR
 * 
 * @param near - Amount in NEAR
 * @returns Amount in yoctoNEAR (smallest unit)
 * 
 * @example
 * ```typescript
 * const yocto = nearToYocto('1.5');
 * // Returns: "1500000000000000000000000"
 * ```
 */
export function nearToYocto(near: string): string {
  const yoctoPerNear = BigInt('1000000000000000000000000'); // 10^24
  const [whole, decimal = ''] = near.split('.');
  const paddedDecimal = decimal.padEnd(24, '0').slice(0, 24);
  const yoctoNum = BigInt(whole) * yoctoPerNear + BigInt(paddedDecimal);
  return yoctoNum.toString();
}

/**
 * Convert yoctoNEAR to NEAR amount
 * 
 * @param yocto - Amount in yoctoNEAR (smallest unit)
 * @returns Amount in NEAR
 * 
 * @example
 * ```typescript
 * const near = yoctoToNear('1500000000000000000000000');
 * // Returns: "1.5000"
 * ```
 */
export function yoctoToNear(yocto: string): string {
  const yoctoPerNear = '1000000000000000000000000'; // 10^24
  const nearNum = parseFloat(yocto) / parseFloat(yoctoPerNear);
  return nearNum.toFixed(4);
}

/**
 * Format token amount with decimals
 * 
 * @param amount - Amount in smallest units
 * @param decimals - Token decimals
 * @param maxDecimals - Maximum decimal places to show (default: 4)
 * @returns Formatted amount
 * 
 * @example
 * ```typescript
 * formatTokenAmount('1500000', 6); // "1.5000"
 * formatTokenAmount('1234567890', 6, 2); // "1234.57"
 * ```
 */
export function formatTokenAmount(
  amount: string,
  decimals: number,
  maxDecimals: number = 4
): string {
  const divisor = Math.pow(10, decimals);
  const num = parseFloat(amount) / divisor;
  return num.toFixed(Math.min(maxDecimals, decimals));
}

/**
 * Format currency amount with symbol
 * 
 * @param amount - Amount in smallest units
 * @param currency - Currency code
 * @param maxDecimals - Maximum decimal places (optional)
 * @returns Formatted currency string
 * 
 * @example
 * ```typescript
 * formatCurrency('5000000', 'USD'); // "$50.00"
 * formatCurrency('1500000000000000000000000', 'NEAR'); // "1.5000 NEAR"
 * formatCurrency('1000000', 'USDC', 2); // "1.00 USDC"
 * ```
 */
export function formatCurrency(
  amount: string,
  currency: string,
  maxDecimals?: number
): string {
  const token = getTokenConfig(currency);
  const decimalsToUse = maxDecimals !== undefined ? maxDecimals : token.decimals <= 6 ? 2 : 4;
  const formatted = formatTokenAmount(amount, token.decimals, decimalsToUse);

  // Special formatting for fiat
  if (currency === 'USD') {
    return `$${formatted}`;
  } else if (currency === 'EUR') {
    return `€${formatted}`;
  }

  return `${formatted} ${token.symbol}`;
}

/**
 * Format NEAR amount for display
 * 
 * @param yoctoNear - Amount in yoctoNEAR
 * @returns Formatted NEAR string
 * 
 * @example
 * ```typescript
 * formatNear('1500000000000000000000000'); // "1.5000 NEAR"
 * ```
 */
export function formatNear(yoctoNear: string): string {
  return `${yoctoToNear(yoctoNear)} NEAR`;
}

/**
 * Parse currency amount from human-readable string
 * 
 * @param amount - Human-readable amount (e.g., "1.5")
 * @param currency - Currency code
 * @returns Amount in smallest units
 * 
 * @example
 * ```typescript
 * parseCurrencyAmount('50.00', 'USD'); // "50000000" (6 decimals)
 * parseCurrencyAmount('1.5', 'NEAR'); // "1500000000000000000000000" (24 decimals)
 * ```
 */
export function parseCurrencyAmount(amount: string, currency: string): string {
  const token = getTokenConfig(currency);
  const [whole, decimal = ''] = amount.split('.');
  const paddedDecimal = decimal.padEnd(token.decimals, '0').slice(0, token.decimals);
  const multiplier = BigInt(10) ** BigInt(token.decimals);
  const result = BigInt(whole) * multiplier + BigInt(paddedDecimal);
  return result.toString();
}

/**
 * Create a TokenAmount object with formatting
 * 
 * @param amount - Amount in smallest units
 * @param currency - Currency code
 * @returns TokenAmount with formatted display
 * 
 * @example
 * ```typescript
 * const amount = createTokenAmount('50000000', 'USD');
 * console.log(amount.formatted); // "50.00"
 * console.log(amount.symbol); // "USD"
 * console.log(amount.raw); // "50000000"
 * ```
 */
export function createTokenAmount(amount: string, currency: string): {
  raw: string;
  formatted: string;
  symbol: string;
  decimals: number;
} {
  const token = getTokenConfig(currency);
  return {
    raw: amount,
    formatted: formatTokenAmount(amount, token.decimals),
    symbol: token.symbol,
    decimals: token.decimals,
  };
}
