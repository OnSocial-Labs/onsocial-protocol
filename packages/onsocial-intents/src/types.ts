/**
 * NEAR Intents 1Click API Types
 *
 * Aligned 1 : 1 with the OpenAPI spec at
 * https://1click.chaindefuser.com/docs/v0/openapi.yaml
 *
 * No hardcoded token lists — the API is the registry.
 *
 * @module onsocial-intents/types
 */

// ── Enums (union types for tree-shaking) ────────────────────────────────────

/** How to interpret `amount` in a quote request. */
export type SwapType = 'EXACT_INPUT' | 'EXACT_OUTPUT' | 'FLEX_INPUT' | 'ANY_INPUT';

/**
 * Address type for deposit / recipient / refund.
 *
 * - `ORIGIN_CHAIN`      – address on the origin chain
 * - `DESTINATION_CHAIN`  – address on the destination chain
 * - `INTENTS`            – account inside NEAR Intents (verifier contract)
 */
export type AddressType = 'ORIGIN_CHAIN' | 'DESTINATION_CHAIN' | 'INTENTS';

/**
 * Deposit address mode.
 *
 * - `SIMPLE` – normal deposit address
 * - `MEMO`   – deposit address + required memo (e.g. Stellar)
 */
export type DepositMode = 'SIMPLE' | 'MEMO';

/** Swap lifecycle status. */
export type SwapStatus =
  | 'PENDING_DEPOSIT'
  | 'KNOWN_DEPOSIT_TX'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'INCOMPLETE_DEPOSIT'
  | 'REFUNDED'
  | 'FAILED';

/**
 * Blockchains the 1Click API may support.
 * The `(string & {})` union allows future chains without a type error.
 */
export type Blockchain =
  | 'near' | 'eth' | 'base' | 'arb' | 'btc' | 'sol' | 'ton'
  | 'doge' | 'xrp' | 'zec' | 'gnosis' | 'bera' | 'bsc' | 'pol'
  | 'tron' | 'sui' | 'op' | 'avax' | 'cardano' | 'ltc' | 'xlayer'
  | 'monad' | 'bch' | 'adi' | 'plasma' | 'starknet' | 'aleo'
  | (string & {});

// ── Token (GET /v0/tokens) ──────────────────────────────────────────────────

/** A single token returned by the 1Click token-discovery endpoint. */
export interface Token {
  /** Unique asset identifier, e.g. `nep141:wrap.near`. */
  assetId: string;
  /** Number of decimals. */
  decimals: number;
  /** Blockchain the token lives on. */
  blockchain: Blockchain;
  /** Ticker symbol, e.g. `wNEAR`, `USDC`. */
  symbol: string;
  /** Current USD price. */
  price: number;
  /** ISO timestamp of last price update. */
  priceUpdatedAt: string;
  /** On-chain contract address (if applicable). */
  contractAddress?: string;
}

// ── App Fee ─────────────────────────────────────────────────────────────────

/** Fee entry for distribution-channel revenue. */
export interface AppFee {
  /** Recipient account within Intents. */
  recipient: string;
  /** Fee in basis points (100 = 1 %). */
  fee: number;
}

// ── Quote Request (POST /v0/quote) ──────────────────────────────────────────

export interface QuoteRequest {
  /** `true` for price preview only (no deposit address generated). */
  dry: boolean;
  swapType: SwapType;
  /** Slippage tolerance in basis points (100 = 1 %). */
  slippageTolerance: number;
  /** Origin asset ID, e.g. `nep141:wrap.near`. */
  originAsset: string;
  depositType: AddressType;
  /** Destination asset ID. */
  destinationAsset: string;
  /** Amount in smallest units. */
  amount: string;
  /** Where to refund on failure. */
  refundTo: string;
  refundType: AddressType;
  /** Recipient of the swapped asset. */
  recipient: string;
  recipientType: AddressType;
  /** ISO 8601 deadline — after this the deposit is refunded. */
  deadline: string;

  // ── Optional ──
  depositMode?: DepositMode;
  connectedWallets?: string[];
  sessionId?: string;
  virtualChainRecipient?: string;
  virtualChainRefundRecipient?: string;
  /**
   * EXPERIMENTAL — message passed to `ft_transfer_call` on NEAR withdrawal.
   * WARNING: funds lost if recipient lacks `ft_on_transfer` or storage.
   */
  customRecipientMsg?: string;
  /** Lowercase referral tag (displayed on analytics platforms). */
  referral?: string;
  /** How long to wait for a solver quote (ms, default 3 000). */
  quoteWaitingTimeMs?: number;
  /** Distribution-channel fees deducted from amountIn. */
  appFees?: AppFee[];
}

// ── Quote (nested inside QuoteResponse) ─────────────────────────────────────

export interface Quote {
  /** Deposit address (absent on dry run). */
  depositAddress?: string;
  /** Memo required alongside the deposit (e.g. Stellar). */
  depositMemo?: string;
  amountIn: string;
  amountInFormatted: string;
  amountInUsd: string;
  minAmountIn: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd: string;
  minAmountOut: string;
  /** Estimated swap duration in seconds. */
  timeEstimate: number;
  /** When the deposit address expires (ISO). */
  deadline?: string;
  /** When the deposit address goes cold (ISO). */
  timeWhenInactive?: string;
  virtualChainRecipient?: string;
  virtualChainRefundRecipient?: string;
  customRecipientMsg?: string;
  /** Refund fee in smallest unit of origin asset. */
  refundFee?: string;
}

// ── Quote Response ──────────────────────────────────────────────────────────

export interface QuoteResponse {
  correlationId: string;
  timestamp: string;
  /** Signature for dispute resolution — save client-side. */
  signature: string;
  quoteRequest: QuoteRequest;
  quote: Quote;
}

// ── Deposit Submit (POST /v0/deposit/submit) ────────────────────────────────

export interface SubmitDepositRequest {
  txHash: string;
  depositAddress: string;
  /** Required for NEAR-chain deposits. */
  nearSenderAccount?: string;
  /** Include if deposit was submitted with a memo. */
  memo?: string;
}

export interface TransactionDetails {
  hash: string;
  explorerUrl: string;
}

export interface SwapDetails {
  intentHashes: string[];
  nearTxHashes: string[];
  originChainTxHashes: TransactionDetails[];
  destinationChainTxHashes: TransactionDetails[];
  amountIn?: string;
  amountInFormatted?: string;
  amountInUsd?: string;
  amountOut?: string;
  amountOutFormatted?: string;
  amountOutUsd?: string;
  slippage?: number;
  refundedAmount?: string;
  refundedAmountFormatted?: string;
  refundedAmountUsd?: string;
  refundReason?: string;
  depositedAmount?: string;
  depositedAmountFormatted?: string;
  depositedAmountUsd?: string;
  referral?: string;
}

// ── Status (GET /v0/status) ─────────────────────────────────────────────────

export interface StatusResponse {
  correlationId: string;
  quoteResponse: QuoteResponse;
  status: SwapStatus;
  updatedAt: string;
  swapDetails: SwapDetails;
}

// ── Deposit Submit Response ─────────────────────────────────────────────────

export interface SubmitDepositResponse {
  correlationId: string;
  quoteResponse: QuoteResponse;
  status: SwapStatus;
  updatedAt: string;
  swapDetails: SwapDetails;
}

// ── ANY_INPUT Withdrawals (GET /v0/any-input/withdrawals) ───────────────────

export interface AnyInputWithdrawal {
  status: 'SUCCESS' | 'FAILED';
  amountOutFormatted: string;
  amountOutUsd: string;
  amountOut: string;
  withdrawFeeFormatted: string;
  withdrawFee: string;
  withdrawFeeUsd: string;
  timestamp: string;
  hash: string;
}

export interface AnyInputWithdrawalsResponse {
  asset: string;
  recipient: string;
  affiliateRecipient: string;
  withdrawals: AnyInputWithdrawal[];
}

// ── Client Config ───────────────────────────────────────────────────────────

export interface ClientConfig {
  /** Base URL (default: `https://1click.chaindefuser.com`). */
  baseUrl?: string;
  /** JWT token — authenticated requests skip the 0.2 % platform fee. */
  jwtToken?: string;
  /** Default slippage in basis points (default: 100 = 1 %). */
  defaultSlippage?: number;
  /** Default deadline offset in ms (default: 3 600 000 = 1 h). */
  defaultDeadline?: number;
  /** Default referral tag applied to every quote. */
  referral?: string;
  /** Default app fees applied to every quote. */
  appFees?: AppFee[];
}
