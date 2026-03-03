/**
 * OnSocial Intents — NEAR Intents 1Click API client
 *
 * Fully dynamic: no hardcoded token lists. Token discovery is backed by
 * `GET /v0/tokens` with in-memory caching.
 *
 * @module onsocial-intents
 * @packageDocumentation
 */

// ── Client ──────────────────────────────────────────────────────────────────
export { IntentsClient, createClient } from './client';

// ── Token Registry ──────────────────────────────────────────────────────────
export { TokenRegistry, createRegistry } from './registry';

// ── Utilities ───────────────────────────────────────────────────────────────
export {
  parseAmount,
  formatAmount,
  formatAssetId,
  parseAssetId,
  isTerminalStatus,
} from './utils';

// ── Types ───────────────────────────────────────────────────────────────────
export type {
  // Enums (union types)
  SwapType,
  AddressType,
  DepositMode,
  SwapStatus,
  Blockchain,

  // Token
  Token,

  // Fee
  AppFee,

  // Quote
  QuoteRequest,
  Quote,
  QuoteResponse,

  // Deposit
  SubmitDepositRequest,
  SubmitDepositResponse,

  // Status
  TransactionDetails,
  SwapDetails,
  StatusResponse,

  // ANY_INPUT
  AnyInputWithdrawal,
  AnyInputWithdrawalsResponse,

  // Config
  ClientConfig,
} from './types';
