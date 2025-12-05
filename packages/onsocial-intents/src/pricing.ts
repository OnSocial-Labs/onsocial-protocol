/**
 * Currency Pricing Oracle using NEAR Intents
 * 
 * Uses NEAR Intents getQuote() API as an implicit pricing oracle.
 * Enables stable USD/EUR pricing without on-chain oracle costs.
 * 
 * @module onsocial-intents/pricing
 */

import { IntentsClient } from './client';
import { getCurrencyAsset, SUPPORTED_TOKENS } from './tokens';
import type {
  PriceMode,
  PriceRequest,
  ConversionOptions,
  QuoteRequest,
  SwapType,
  AddressType,
  ClientConfig,
} from './types';

/**
 * Convert a PriceMode to NEAR using NEAR Intents as pricing oracle
 * 
 * For Currency mode: queries NEAR Intents for real-time conversion rate
 * For NEAR mode: returns the price directly
 * 
 * This enables stable pricing (USD, EUR, etc.) without on-chain oracles!
 * 
 * @param price - Price in Currency or NEAR mode
 * @param options - Conversion options
 * @returns Price in yoctoNEAR
 * 
 * @example
 * ```typescript
 * // Convert $50 ticket price to NEAR
 * const ticketPrice: PriceMode = {
 *   type: 'Currency',
 *   amount: '50000000', // $50.00 (6 decimals)
 *   currency: 'USD',
 * };
 * 
 * const nearPrice = await convertToNear(ticketPrice);
 * console.log(`${nearPrice} yoctoNEAR (~${formatNear(nearPrice)} NEAR)`);
 * ```
 */
export async function convertToNear(
  price: PriceMode,
  options?: ConversionOptions
): Promise<string> {
  // NEAR mode: return price directly
  if (price.type === 'NEAR') {
    return price.priceNear;
  }

  // Currency mode: use NEAR Intents as oracle
  const client = new IntentsClient();

  const originAsset = getCurrencyAsset(price.currency);
  const slippageTolerance = options?.slippageTolerance || 100; // 1%
  const deadlineMs = options?.deadlineMs || 3600000; // 1 hour
  const dry = options?.dry !== undefined ? options.dry : true; // Default to dry run for pricing

  const quoteRequest: QuoteRequest = {
    dry,
    swapType: 'EXACT_INPUT' as SwapType,
    originAsset,
    destinationAsset: 'nep141:wrap.near', // wNEAR for swaps
    amount: price.amount,
    depositType: 'INTENTS' as AddressType,
    recipient: options?.refundTo || 'pricing.near', // Dummy for dry runs
    recipientType: 'INTENTS' as AddressType,
    refundTo: options?.refundTo || 'pricing.near', // Dummy for dry runs
    refundType: 'INTENTS' as AddressType,
    slippageTolerance,
    deadline: new Date(Date.now() + deadlineMs).toISOString(),
  };

  const quote = await client.getQuote(quoteRequest);
  return quote.amountOut;
}

/**
 * Get exchange rate between any two currencies using NEAR Intents
 * 
 * Acts as a decentralized pricing oracle without on-chain costs.
 * 
 * @param params - Price request parameters
 * @returns Amount in destination currency (smallest units)
 * 
 * @example
 * ```typescript
 * // Get NEAR price in USD
 * const nearInUsd = await getPrice({
 *   fromCurrency: 'NEAR',
 *   toCurrency: 'USD',
 *   amount: '1000000000000000000000000', // 1 NEAR
 * });
 * 
 * // Get SOCIAL price in NEAR
 * const socialInNear = await getPrice({
 *   fromCurrency: 'SOCIAL',
 *   toCurrency: 'NEAR',
 *   amount: '1000000000000000000000000', // 1 SOCIAL
 * });
 * ```
 */
export async function getPrice(params: PriceRequest): Promise<string> {
  const client = new IntentsClient();

  const originAsset = getCurrencyAsset(params.fromCurrency);
  const destinationAsset = getCurrencyAsset(params.toCurrency);
  const dry = params.dry !== undefined ? params.dry : true;

  const quoteRequest: QuoteRequest = {
    dry,
    swapType: 'EXACT_INPUT' as SwapType,
    originAsset,
    destinationAsset,
    amount: params.amount,
    depositType: 'INTENTS' as AddressType,
    recipient: 'pricing.near', // Dummy for dry runs
    recipientType: 'INTENTS' as AddressType,
    refundTo: 'pricing.near',
    refundType: 'INTENTS' as AddressType,
    slippageTolerance: 100, // 1%
    deadline: new Date(Date.now() + 3600000).toISOString(),
  };

  const quote = await client.getQuote(quoteRequest);
  return quote.amountOut;
}

/**
 * Get current NEAR price in USD
 * 
 * @returns Price of 1 NEAR in USD cents (2 decimals)
 * 
 * @example
 * ```typescript
 * const nearPriceUsd = await getNearPriceUsd();
 * console.log(`1 NEAR = $${(parseInt(nearPriceUsd) / 100).toFixed(2)}`);
 * ```
 */
export async function getNearPriceUsd(): Promise<string> {
  return getPrice({
    fromCurrency: 'NEAR',
    toCurrency: 'USD',
    amount: '1000000000000000000000000', // 1 NEAR (24 decimals)
  });
}

/**
 * Get USD price in NEAR
 * 
 * @param usdAmount - Amount in USD cents (2 decimals)
 * @returns Price in yoctoNEAR
 * 
 * @example
 * ```typescript
 * const nearPrice = await getUsdPriceNear('5000'); // $50.00
 * console.log(`$50 = ${formatNear(nearPrice)} NEAR`);
 * ```
 */
export async function getUsdPriceNear(usdAmount: string): Promise<string> {
  return convertToNear({
    type: 'Currency',
    amount: usdAmount,
    currency: 'USD',
  });
}

/**
 * Convert price from one currency to another
 * 
 * @param amount - Amount in source currency (smallest units)
 * @param fromCurrency - Source currency code
 * @param toCurrency - Destination currency code
 * @returns Amount in destination currency (smallest units)
 * 
 * @example
 * ```typescript
 * // Convert 100 USDC to NEAR
 * const nearAmount = await convertCurrency(
 *   '100000000', // 100 USDC (6 decimals)
 *   'USDC',
 *   'NEAR'
 * );
 * ```
 */
export async function convertCurrency(
  amount: string,
  fromCurrency: string,
  toCurrency: string
): Promise<string> {
  return getPrice({
    fromCurrency,
    toCurrency,
    amount,
  });
}

/**
 * Create a Currency PriceMode
 * 
 * @param amount - Amount in smallest units
 * @param currency - Currency code
 * @returns Currency PriceMode
 * 
 * @example
 * ```typescript
 * const ticketPrice = createCurrencyPrice('50000000', 'USD'); // $50.00
 * const socialPrice = createCurrencyPrice('100000000000000000000000', 'SOCIAL'); // 0.1 SOCIAL
 * ```
 */
export function createCurrencyPrice(amount: string, currency: string): PriceMode {
  return {
    type: 'Currency',
    amount,
    currency,
  };
}

/**
 * Create a NEAR PriceMode
 * 
 * @param priceNear - Price in yoctoNEAR
 * @returns NEAR PriceMode
 * 
 * @example
 * ```typescript
 * const nftPrice = createNearPrice('5000000000000000000000000'); // 5 NEAR
 * ```
 */
export function createNearPrice(priceNear: string): PriceMode {
  return {
    type: 'NEAR',
    priceNear,
  };
}

/**
 * Check if a currency is supported by NEAR Intents
 * 
 * @param currency - Currency code to check
 * @returns Whether currency is supported
 * 
 * @example
 * ```typescript
 * if (isCurrencySupported('USD')) {
 *   console.log('Can accept USD payments!');
 * }
 * ```
 */
export function isCurrencySupported(currency: string): boolean {
  try {
    getCurrencyAsset(currency);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get list of all supported currencies
 * 
 * @returns Array of supported currency codes
 * 
 * @example
 * ```typescript
 * const currencies = getSupportedCurrencies();
 * console.log('Supported:', currencies.join(', '));
 * // Output: "NEAR, USD, USDC, USDT, SOCIAL, ..."
 * ```
 */
export function getSupportedCurrencies(): string[] {
  return Object.keys(SUPPORTED_TOKENS);
}
