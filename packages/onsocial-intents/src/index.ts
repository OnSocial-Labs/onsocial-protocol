/**
 * OnSocial Intents
 * 
 * NEAR Intents API client for multi-token payments and currency pricing oracle.
 * 
 * @module onsocial-intents
 * @packageDocumentation
 */

// Client
export { IntentsClient, createClient } from './client';

// Pricing Oracle
export {
  convertToNear,
  getPrice,
  getNearPriceUsd,
  getUsdPriceNear,
  convertCurrency,
  createCurrencyPrice,
  createNearPrice,
  isCurrencySupported,
  getSupportedCurrencies,
} from './pricing';

// Tokens & Utilities
export {
  SUPPORTED_TOKENS,
  getCurrencyAsset,
  getTokenConfig,
  formatNep141Asset,
  parseAssetId,
  isStablecoin,
  getStablecoins,
  nearToYocto,
  yoctoToNear,
  formatTokenAmount,
  formatCurrency,
  formatNear,
  parseCurrencyAmount,
  createTokenAmount,
} from './tokens';

// Types
export type {
  AssetId,
  QuoteRequest,
  QuoteResponse,
  StatusResponse,
  DepositResponse,
  PriceMode,
  PriceRequest,
  ConversionOptions,
  ClientConfig,
  TokenConfig,
  TokenAmount,
} from './types';

export { SwapStatus, SwapType, AddressType } from './types';
