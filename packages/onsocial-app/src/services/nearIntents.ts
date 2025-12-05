/**
 * NEAR Intents (1Click API) Integration
 * 
 * Enables multi-token and cross-chain payments for NFT marketplace purchases.
 * Users can pay with any supported token (SOCIAL, USDC, USDT, etc.) and solvers
 * automatically swap to NEAR before calling the marketplace contract.
 * 
 * Documentation: https://docs.near-intents.org/near-intents/integration/distribution-channels/1click-api
 * Base URL: https://1click.chaindefuser.com/
 * 
 * To eliminate the 0.1% fee, obtain a free JWT token:
 * https://docs.google.com/forms/d/e/1FAIpQLSdrSrqSkKOMb_a8XhwF0f7N5xZ0Y5CYgyzxiAuoC2g4a2N68g/viewform
 */

const BASE_URL = 'https://1click.chaindefuser.com';

// Set this to your JWT token to eliminate 0.1% fee
const JWT_TOKEN = process.env.NEXT_PUBLIC_NEAR_INTENTS_JWT || '';

/**
 * Asset format: "nep141:token.near" or "near" for native NEAR
 */
export type AssetId = string;

/**
 * Swap status from 1Click API
 */
export enum SwapStatus {
  PENDING_DEPOSIT = 'PENDING_DEPOSIT',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  INCOMPLETE_DEPOSIT = 'INCOMPLETE_DEPOSIT',
  REFUNDED = 'REFUNDED',
  FAILED = 'FAILED',
}

/**
 * Quote request parameters
 */
export interface QuoteRequest {
  /** Set to false for actual swap, true for testing */
  dry: boolean;
  /** Swap type - EXACT_INPUT means user specifies input amount */
  swapType: 'EXACT_INPUT' | 'EXACT_OUTPUT';
  /** Origin asset (what user pays with) - e.g., "nep141:social.tkn.near" */
  originAsset: AssetId;
  /** Destination asset (what recipient receives) - e.g., "near" */
  destinationAsset: AssetId;
  /** Amount to swap (in smallest units - yoctoNEAR, base tokens, etc.) */
  amount: string;
  /** Who receives the swapped funds */
  recipient: string;
  /** Recipient type - INTENTS for NEAR accounts */
  recipientType: 'INTENTS' | 'EVM';
  /** Where to refund if swap fails */
  refundTo: string;
  /** Refund type - INTENTS for NEAR accounts */
  refundType: 'INTENTS' | 'EVM';
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
  /** Asset user should deposit (e.g., "nep141:social.tkn.near") */
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
 * Get a quote for swapping tokens
 * 
 * @param request - Quote request parameters
 * @returns Quote with deposit address and amounts
 * 
 * @example
 * ```ts
 * const quote = await getQuote({
 *   dry: false,
 *   swapType: 'EXACT_INPUT',
 *   originAsset: 'nep141:social.tkn.near',
 *   destinationAsset: 'near',
 *   amount: '1000000000000000000000000', // 1 SOCIAL
 *   recipient: 'marketplace.near',
 *   recipientType: 'INTENTS',
 *   refundTo: 'user.near',
 *   refundType: 'INTENTS',
 *   slippageTolerance: 100, // 1%
 *   deadline: new Date(Date.now() + 3600000).toISOString(), // 1 hour
 * });
 * ```
 */
export async function getQuote(request: QuoteRequest): Promise<QuoteResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (JWT_TOKEN) {
    headers['Authorization'] = `Bearer ${JWT_TOKEN}`;
  }

  const response = await fetch(`${BASE_URL}/v0/quote`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get quote: ${error}`);
  }

  return response.json();
}

/**
 * Submit a deposit confirmation to the 1Click API
 * 
 * This is optional but recommended after user deposits tokens to trigger
 * faster processing by solvers.
 * 
 * @param depositAddress - The deposit address from the quote
 * @param txHash - Transaction hash of the user's deposit
 * @returns Confirmation response
 * 
 * @example
 * ```ts
 * await submitDeposit(quote.depositAddress, userTxHash);
 * ```
 */
export async function submitDeposit(
  depositAddress: string,
  txHash: string
): Promise<{ success: boolean }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (JWT_TOKEN) {
    headers['Authorization'] = `Bearer ${JWT_TOKEN}`;
  }

  const response = await fetch(`${BASE_URL}/v0/deposit/submit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      depositAddress,
      txHash,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to submit deposit: ${error}`);
  }

  return response.json();
}

/**
 * Get the status of a swap by deposit address
 * 
 * @param depositAddress - The deposit address from the quote
 * @returns Current swap status
 * 
 * @example
 * ```ts
 * const status = await getSwapStatus(quote.depositAddress);
 * if (status.status === SwapStatus.SUCCESS) {
 *   console.log('NFT purchase complete!');
 * }
 * ```
 */
export async function getSwapStatus(depositAddress: string): Promise<StatusResponse> {
  const headers: Record<string, string> = {};

  if (JWT_TOKEN) {
    headers['Authorization'] = `Bearer ${JWT_TOKEN}`;
  }

  const response = await fetch(
    `${BASE_URL}/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`,
    { headers }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get swap status: ${error}`);
  }

  return response.json();
}

/**
 * Poll swap status until completion or timeout
 * 
 * @param depositAddress - The deposit address from the quote
 * @param onUpdate - Callback called on each status update
 * @param maxAttempts - Maximum polling attempts (default: 60)
 * @param intervalMs - Polling interval in milliseconds (default: 5000)
 * @returns Final swap status
 * 
 * @example
 * ```ts
 * const finalStatus = await pollSwapStatus(
 *   quote.depositAddress,
 *   (status) => console.log('Current status:', status.status),
 *   60,
 *   5000
 * );
 * ```
 */
export async function pollSwapStatus(
  depositAddress: string,
  onUpdate?: (status: StatusResponse) => void,
  maxAttempts: number = 60,
  intervalMs: number = 5000
): Promise<StatusResponse> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const status = await getSwapStatus(depositAddress);

    if (onUpdate) {
      onUpdate(status);
    }

    // Terminal states
    if (
      status.status === SwapStatus.SUCCESS ||
      status.status === SwapStatus.FAILED ||
      status.status === SwapStatus.REFUNDED
    ) {
      return status;
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    attempts++;
  }

  throw new Error('Swap status polling timeout');
}

/**
 * Helper: Convert NEAR amount to yoctoNEAR
 * @param near - Amount in NEAR
 * @returns Amount in yoctoNEAR (smallest unit)
 */
export function nearToYocto(near: string): string {
  const yoctoPerNear = '1000000000000000000000000'; // 10^24
  const nearNum = parseFloat(near);
  const yoctoNum = nearNum * parseFloat(yoctoPerNear);
  return Math.floor(yoctoNum).toString();
}

/**
 * Helper: Convert yoctoNEAR to NEAR amount
 * @param yocto - Amount in yoctoNEAR (smallest unit)
 * @returns Amount in NEAR
 */
export function yoctoToNear(yocto: string): string {
  const yoctoPerNear = '1000000000000000000000000'; // 10^24
  const nearNum = parseFloat(yocto) / parseFloat(yoctoPerNear);
  return nearNum.toFixed(4);
}

/**
 * Helper: Format asset ID for 1Click API
 * @param contractId - NEP-141 token contract ID (e.g., "social.tkn.near")
 * @returns Formatted asset ID (e.g., "nep141:social.tkn.near")
 */
export function formatNep141Asset(contractId: string): AssetId {
  return `nep141:${contractId}`;
}
