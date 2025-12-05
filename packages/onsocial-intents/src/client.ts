/**
 * NEAR Intents API Client
 * 
 * Client for interacting with NEAR Intents 1Click API.
 * Enables multi-token and cross-chain payments.
 * 
 * @module onsocial-intents/client
 */

import type {
  QuoteRequest,
  QuoteResponse,
  StatusResponse,
  DepositResponse,
  ClientConfig,
  SwapStatus,
} from './types';
import { SwapStatus as SwapStatusEnum } from './types';

const DEFAULT_BASE_URL = 'https://1click.chaindefuser.com';
const DEFAULT_SLIPPAGE = 100; // 1%
const DEFAULT_DEADLINE_MS = 3600000; // 1 hour

/**
 * NEAR Intents 1Click API Client
 * 
 * @example
 * ```typescript
 * const client = new IntentsClient({
 *   jwtToken: process.env.NEAR_INTENTS_JWT,
 * });
 * 
 * const quote = await client.getQuote({
 *   originAsset: 'nep141:usdc.e.near',
 *   destinationAsset: 'near',
 *   amount: '100000000',
 *   recipient: 'marketplace.near',
 *   refundTo: 'user.near',
 * });
 * ```
 */
export class IntentsClient {
  private baseUrl: string;
  private jwtToken?: string;
  private defaultSlippage: number;
  private defaultDeadline: number;

  constructor(config?: ClientConfig) {
    this.baseUrl = config?.baseUrl || DEFAULT_BASE_URL;
    this.jwtToken = config?.jwtToken;
    this.defaultSlippage = config?.defaultSlippage || DEFAULT_SLIPPAGE;
    this.defaultDeadline = config?.defaultDeadline || DEFAULT_DEADLINE_MS;
  }

  /**
   * Get headers for API requests
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.jwtToken) {
      headers['Authorization'] = `Bearer ${this.jwtToken}`;
    }

    return headers;
  }

  /**
   * Get a quote for swapping tokens
   * 
   * @param request - Quote request parameters
   * @returns Quote with deposit address and amounts
   * 
   * @example
   * ```typescript
   * const quote = await client.getQuote({
   *   dry: false,
   *   swapType: SwapType.EXACT_INPUT,
   *   originAsset: 'nep141:usdc.e.near',
   *   destinationAsset: 'near',
   *   amount: '100000000', // 100 USDC
   *   recipient: 'marketplace.near',
   *   recipientType: AddressType.INTENTS,
   *   refundTo: 'user.near',
   *   refundType: AddressType.INTENTS,
   *   slippageTolerance: 100,
   *   deadline: new Date(Date.now() + 3600000).toISOString(),
   * });
   * ```
   */
  async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
    const response = await fetch(`${this.baseUrl}/v0/quote`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get quote: ${error}`);
    }

    const result = await response.json() as any;
    // API returns nested quote object
    return result.quote as QuoteResponse;
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
   * ```typescript
   * await client.submitDeposit(quote.depositAddress, userTxHash);
   * ```
   */
  async submitDeposit(
    depositAddress: string,
    txHash: string
  ): Promise<DepositResponse> {
    const response = await fetch(`${this.baseUrl}/v0/deposit/submit`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        depositAddress,
        txHash,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to submit deposit: ${error}`);
    }

    return response.json() as Promise<DepositResponse>;
  }

  /**
   * Get the status of a swap by deposit address
   * 
   * @param depositAddress - The deposit address from the quote
   * @returns Current swap status
   * 
   * @example
   * ```typescript
   * const status = await client.getSwapStatus(quote.depositAddress);
   * if (status.status === SwapStatus.SUCCESS) {
   *   console.log('NFT purchase complete!');
   * }
   * ```
   */
  async getSwapStatus(depositAddress: string): Promise<StatusResponse> {
    const response = await fetch(
      `${this.baseUrl}/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`,
      { headers: this.getHeaders() }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get swap status: ${error}`);
    }

    return response.json() as Promise<StatusResponse>;
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
   * ```typescript
   * const finalStatus = await client.pollSwapStatus(
   *   quote.depositAddress,
   *   (status) => console.log('Current status:', status.status),
   *   60,
   *   5000
   * );
   * ```
   */
  async pollSwapStatus(
    depositAddress: string,
    onUpdate?: (status: StatusResponse) => void,
    maxAttempts: number = 60,
    intervalMs: number = 5000
  ): Promise<StatusResponse> {
    let attempts = 0;

    while (attempts < maxAttempts) {
      const status = await this.getSwapStatus(depositAddress);

      if (onUpdate) {
        onUpdate(status);
      }

      // Terminal states
      if (
        status.status === SwapStatusEnum.SUCCESS ||
        status.status === SwapStatusEnum.FAILED ||
        status.status === SwapStatusEnum.REFUNDED
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
   * Get default slippage tolerance
   */
  getDefaultSlippage(): number {
    return this.defaultSlippage;
  }

  /**
   * Get default deadline offset
   */
  getDefaultDeadline(): number {
    return this.defaultDeadline;
  }

  /**
   * Create a deadline timestamp for quotes
   * 
   * @param offsetMs - Milliseconds from now (default: uses configured default)
   * @returns ISO 8601 timestamp
   */
  createDeadline(offsetMs?: number): string {
    const ms = offsetMs !== undefined ? offsetMs : this.defaultDeadline;
    return new Date(Date.now() + ms).toISOString();
  }
}

/**
 * Create a new IntentsClient instance
 * 
 * @param config - Client configuration
 * @returns Configured IntentsClient
 * 
 * @example
 * ```typescript
 * const client = createClient({
 *   jwtToken: process.env.NEAR_INTENTS_JWT,
 *   defaultSlippage: 100,
 * });
 * ```
 */
export function createClient(config?: ClientConfig): IntentsClient {
  return new IntentsClient(config);
}
