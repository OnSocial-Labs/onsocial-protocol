/**
 * NEAR Intents 1Click API Client
 *
 * Thin typed wrapper over the 4 endpoints:
 *   GET  /v0/tokens              — token discovery
 *   POST /v0/quote               — request swap quote
 *   POST /v0/deposit/submit      — submit deposit tx hash
 *   GET  /v0/status              — check swap status
 *   GET  /v0/any-input/withdrawals — ANY_INPUT withdrawal details
 *
 * @module onsocial-intents/client
 */

import type {
  QuoteRequest,
  QuoteResponse,
  SubmitDepositRequest,
  SubmitDepositResponse,
  StatusResponse,
  AnyInputWithdrawalsResponse,
  ClientConfig,
  Token,
  SwapStatus,
} from './types';

const DEFAULT_BASE_URL = 'https://1click.chaindefuser.com';
const DEFAULT_SLIPPAGE = 100; // 1 %
const DEFAULT_DEADLINE_MS = 3_600_000; // 1 hour

const TERMINAL_STATUSES: SwapStatus[] = ['SUCCESS', 'FAILED', 'REFUNDED'];

export class IntentsClient {
  private readonly baseUrl: string;
  private readonly jwtToken?: string;
  private readonly defaultSlippage: number;
  private readonly defaultDeadline: number;
  private readonly referral?: string;
  private readonly appFees?: QuoteRequest['appFees'];

  constructor(config?: ClientConfig) {
    this.baseUrl = config?.baseUrl || DEFAULT_BASE_URL;
    this.jwtToken = config?.jwtToken;
    this.defaultSlippage = config?.defaultSlippage ?? DEFAULT_SLIPPAGE;
    this.defaultDeadline = config?.defaultDeadline ?? DEFAULT_DEADLINE_MS;
    this.referral = config?.referral;
    this.appFees = config?.appFees;
  }

  // ── Headers ─────────────────────────────────────────────────────────────

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.jwtToken) h['Authorization'] = `Bearer ${this.jwtToken}`;
    return h;
  }

  // ── GET /v0/tokens ────────────────────────────────────────────────────────

  /** Fetch the full list of tokens currently supported by 1Click. */
  async getTokens(): Promise<Token[]> {
    const res = await fetch(`${this.baseUrl}/v0/tokens`);
    if (!res.ok) throw new Error(`Failed to fetch tokens: ${await res.text()}`);
    return res.json() as Promise<Token[]>;
  }

  // ── POST /v0/quote ────────────────────────────────────────────────────────

  /**
   * Request a swap quote.
   *
   * Client-level defaults (referral, appFees) are merged automatically
   * but can be overridden per call.
   */
  async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
    const body: QuoteRequest = {
      ...request,
      referral: request.referral ?? this.referral,
      appFees: request.appFees ?? this.appFees,
    };

    const res = await fetch(`${this.baseUrl}/v0/quote`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Failed to get quote: ${await res.text()}`);
    return res.json() as Promise<QuoteResponse>;
  }

  // ── POST /v0/deposit/submit ───────────────────────────────────────────────

  /**
   * Notify 1Click that a deposit has been sent.
   * Optional but recommended — speeds up swap processing.
   */
  async submitDeposit(
    request: SubmitDepositRequest
  ): Promise<SubmitDepositResponse> {
    const res = await fetch(`${this.baseUrl}/v0/deposit/submit`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(request),
    });

    if (!res.ok)
      throw new Error(`Failed to submit deposit: ${await res.text()}`);
    return res.json() as Promise<SubmitDepositResponse>;
  }

  // ── GET /v0/status ────────────────────────────────────────────────────────

  /** Check the current status of a swap by deposit address (+ optional memo). */
  async getStatus(
    depositAddress: string,
    depositMemo?: string
  ): Promise<StatusResponse> {
    const params = new URLSearchParams({ depositAddress });
    if (depositMemo) params.set('depositMemo', depositMemo);

    const res = await fetch(`${this.baseUrl}/v0/status?${params}`, {
      headers: this.headers(),
    });

    if (!res.ok) throw new Error(`Failed to get status: ${await res.text()}`);
    return res.json() as Promise<StatusResponse>;
  }

  // ── GET /v0/any-input/withdrawals ─────────────────────────────────────────

  /** Get ANY_INPUT withdrawal details. */
  async getAnyInputWithdrawals(
    depositAddress: string,
    opts?: {
      depositMemo?: string;
      timestampFrom?: string;
      page?: number;
      limit?: number;
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<AnyInputWithdrawalsResponse> {
    const params = new URLSearchParams({ depositAddress });
    if (opts?.depositMemo) params.set('depositMemo', opts.depositMemo);
    if (opts?.timestampFrom) params.set('timestampFrom', opts.timestampFrom);
    if (opts?.page !== undefined) params.set('page', String(opts.page));
    if (opts?.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts?.sortOrder) params.set('sortOrder', opts.sortOrder);

    const res = await fetch(
      `${this.baseUrl}/v0/any-input/withdrawals?${params}`,
      {
        headers: this.headers(),
      }
    );

    if (!res.ok)
      throw new Error(`Failed to get withdrawals: ${await res.text()}`);
    return res.json() as Promise<AnyInputWithdrawalsResponse>;
  }

  // ── Poll ──────────────────────────────────────────────────────────────────

  /**
   * Poll swap status until a terminal state is reached.
   *
   * @param depositAddress  — deposit address from the quote
   * @param onUpdate        — optional callback on each poll
   * @param maxAttempts     — max polls (default 60)
   * @param intervalMs      — interval between polls (default 5 000)
   * @param depositMemo     — memo if required
   */
  async pollStatus(
    depositAddress: string,
    onUpdate?: (status: StatusResponse) => void,
    maxAttempts = 60,
    intervalMs = 5_000,
    depositMemo?: string
  ): Promise<StatusResponse> {
    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.getStatus(depositAddress, depositMemo);
      onUpdate?.(status);

      if (TERMINAL_STATUSES.includes(status.status)) return status;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error('Swap status polling timeout');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Default slippage in basis points. */
  getDefaultSlippage(): number {
    return this.defaultSlippage;
  }

  /** Default deadline offset in ms. */
  getDefaultDeadline(): number {
    return this.defaultDeadline;
  }

  /** Create an ISO deadline string from now. */
  createDeadline(offsetMs?: number): string {
    return new Date(
      Date.now() + (offsetMs ?? this.defaultDeadline)
    ).toISOString();
  }
}

/** Factory shorthand. */
export function createClient(config?: ClientConfig): IntentsClient {
  return new IntentsClient(config);
}
