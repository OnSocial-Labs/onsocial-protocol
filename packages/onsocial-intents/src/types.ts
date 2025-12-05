/**
 * NEAR Intents API Types
 * 
 * Type definitions for NEAR Intents 1Click API and currency pricing.
 * 
 * @module onsocial-intents/types
 */

/**
 * Asset identifier format
 * - Native NEAR: "near"
 * - NEP-141 tokens: "nep141:token.near"
 * - EVM tokens: "evm:0x..."
 */
export type AssetId = string;

/**
 * Swap status from 1Click API
 */
export enum SwapStatus {
  /** Waiting for user to deposit tokens */
  PENDING_DEPOSIT = 'PENDING_DEPOSIT',
  /** Solvers are processing the swap */
  PROCESSING = 'PROCESSING',
  /** Swap completed successfully */
  SUCCESS = 'SUCCESS',
  /** User deposited less than required amount */
  INCOMPLETE_DEPOSIT = 'INCOMPLETE_DEPOSIT',
  /** Swap failed and funds were refunded */
  REFUNDED = 'REFUNDED',
  /** Swap failed permanently */
  FAILED = 'FAILED',
}

/**
 * Swap type for quote requests
 */
export enum SwapType {
  /** User specifies input amount (common for payments) */
  EXACT_INPUT = 'EXACT_INPUT',
  /** User specifies output amount (common for purchases) */
  EXACT_OUTPUT = 'EXACT_OUTPUT',
}

/**
 * Recipient/refund address type
 */
export enum AddressType {
  /** NEAR account ID */
  INTENTS = 'INTENTS',
  /** Ethereum-style address */
  EVM = 'EVM',
}

/**
 * Quote request parameters for NEAR Intents 1Click API
 */
export interface QuoteRequest {
  /** Set to false for actual swap, true for price quotes only */
  dry: boolean;
  /** Swap type - EXACT_INPUT means user specifies input amount */
  swapType: SwapType;
  /** Origin asset (what user pays with) - e.g., "nep141:usdc.e.near" */
  originAsset: AssetId;
  /** Destination asset (what recipient receives) - e.g., "near" */
  destinationAsset: AssetId;
  /** Amount to swap (in smallest units - yoctoNEAR, base tokens, etc.) */
  amount: string;
  /** Deposit type */
  depositType: AddressType;
  /** Who receives the swapped funds */
  recipient: string;
  /** Recipient type */
  recipientType: AddressType;
  /** Where to refund if swap fails */
  refundTo: string;
  /** Refund type */
  refundType: AddressType;
  /** Slippage tolerance in basis points (100 = 1%) */
  slippageTolerance: number;
  /** Swap deadline (ISO 8601 timestamp) */
  deadline: string;
  /** Optional: Custom message to pass to recipient contract (EXPERIMENTAL) */
  customRecipientMsg?: string;
}

/**
 * Quote response from 1Click API
 */
export interface QuoteResponse {
  /** Unique ID for this quote */
  id: string;
  /** Network where user deposits tokens (e.g., "NEAR") */
  depositNetwork: string;
  /** Asset user should deposit (e.g., "nep141:usdc.e.near") */
  depositAsset: string;
  /** Address where user deposits tokens */
  depositAddress: string;
  /** Exact amount user should deposit (in smallest units) */
  amountIn: string;
  /** Estimated amount recipient receives (in smallest units) */
  amountOut: string;
  /** ISO 8601 timestamp when quote expires */
  deadline: string;
}

/**
 * Swap status response from 1Click API
 */
export interface StatusResponse {
  /** Deposit address used for this swap */
  depositAddress: string;
  /** Current status of the swap */
  status: SwapStatus;
  /** Origin asset being swapped from */
  originAsset: string;
  /** Destination asset being swapped to */
  destinationAsset: string;
  /** Amount deposited by user (in smallest units) */
  amountIn?: string;
  /** Amount received by recipient (in smallest units) */
  amountOut?: string;
  /** Transaction hash on destination network */
  txHash?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Deposit submission response
 */
export interface DepositResponse {
  /** Whether deposit was successfully registered */
  success: boolean;
}

/**
 * Price mode for NFT listings
 * 
 * Supports two pricing models:
 * 1. Currency: Stable pricing in fiat or stablecoins (USD, EUR, USDC, etc.)
 * 2. NEAR: Direct NEAR pricing
 * 
 * Currency mode uses NEAR Intents as implicit pricing oracle.
 */
export type PriceMode =
  | {
      /** Currency-based stable pricing */
      type: 'Currency';
      /** Amount in smallest units (e.g., cents for USD, wei for tokens) */
      amount: string;
      /** Currency code (USD, EUR, USDC, USDT, SOCIAL, etc.) */
      currency: string;
    }
  | {
      /** Direct NEAR pricing */
      type: 'NEAR';
      /** Price in yoctoNEAR (10^-24 NEAR) */
      priceNear: string;
    };

/**
 * Currency conversion request
 */
export interface PriceRequest {
  /** Source currency code */
  fromCurrency: string;
  /** Destination currency code */
  toCurrency: string;
  /** Amount in smallest units */
  amount: string;
  /** Whether to use dry run (default: true) */
  dry?: boolean;
}

/**
 * Currency conversion options
 */
export interface ConversionOptions {
  /** Slippage tolerance in basis points (default: 100 = 1%) */
  slippageTolerance?: number;
  /** Deadline offset in milliseconds (default: 3600000 = 1 hour) */
  deadlineMs?: number;
  /** Whether to use dry run (default: true for pricing) */
  dry?: boolean;
  /** Refund address (required for actual swaps) */
  refundTo?: string;
}

/**
 * Client configuration
 */
export interface ClientConfig {
  /** Base URL for NEAR Intents API (default: https://1click.chaindefuser.com) */
  baseUrl?: string;
  /** JWT token to eliminate 0.1% fee */
  jwtToken?: string;
  /** Default slippage tolerance in basis points (default: 100 = 1%) */
  defaultSlippage?: number;
  /** Default deadline offset in milliseconds (default: 3600000 = 1 hour) */
  defaultDeadline?: number;
}

/**
 * Supported token configuration
 */
export interface TokenConfig {
  /** Token symbol (NEAR, SOCIAL, USDC, etc.) */
  symbol: string;
  /** Asset ID for NEAR Intents */
  assetId: AssetId;
  /** Token decimals */
  decimals: number;
  /** Display name */
  name: string;
  /** Icon URL or emoji */
  icon?: string;
  /** Whether this is a stablecoin */
  isStablecoin?: boolean;
}

/**
 * Token amount with display formatting
 */
export interface TokenAmount {
  /** Raw amount in smallest units */
  raw: string;
  /** Human-readable amount */
  formatted: string;
  /** Token symbol */
  symbol: string;
  /** Token decimals */
  decimals: number;
}
