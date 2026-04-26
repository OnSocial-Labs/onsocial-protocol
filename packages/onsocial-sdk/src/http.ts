// ---------------------------------------------------------------------------
// OnSocial SDK — HTTP client core
// ---------------------------------------------------------------------------

import type { ApiError, OnSocialConfig, Network } from './types.js';

const GATEWAY_URLS: Record<Network, string> = {
  mainnet: 'https://api.onsocial.id',
  testnet: 'https://testnet.onsocial.id',
};

/** Low-level HTTP client shared by all modules. */
export class HttpClient {
  readonly baseUrl: string;
  readonly network: Network;
  private _fetch: typeof globalThis.fetch;
  private _token: string | null = null;
  private _apiKey: string | null = null;
  private _actorId: string | null = null;

  constructor(config: OnSocialConfig = {}) {
    this.network = config.network ?? 'mainnet';
    this.baseUrl = (config.gatewayUrl ?? GATEWAY_URLS[this.network]).replace(
      /\/$/,
      ''
    );
    this._fetch = config.fetch ?? globalThis.fetch.bind(globalThis);
    this._apiKey = config.apiKey ?? null;
    this._actorId = config.actorId ?? null;
  }

  /** Set the JWT obtained from login(). */
  setToken(token: string): void {
    this._token = token;
  }

  /** Clear the current JWT. */
  clearToken(): void {
    this._token = null;
  }

  /** True when we have a JWT or API key. */
  get isAuthenticated(): boolean {
    return this._token !== null || this._apiKey !== null;
  }

  /** Current actor account injected for API-key write flows, if configured. */
  get actorId(): string | null {
    return this._actorId;
  }

  // ── Request helpers ─────────────────────────────────────────────────────

  private _headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { ...extra };
    if (this._apiKey) {
      h['X-API-Key'] = this._apiKey;
    } else if (this._token) {
      h['Authorization'] = `Bearer ${this._token}`;
    }
    return h;
  }

  private _isMutationPath(method: string, path: string): boolean {
    return (
      method === 'POST' &&
      (path.startsWith('/compose/') ||
        path.startsWith('/relay/') ||
        path.startsWith('/v1/reward') ||
        path.startsWith('/v1/claim'))
    );
  }

  private _normalizeMutationResponse<T>(
    path: string,
    method: string,
    payload: T
  ): T {
    if (!this._isMutationPath(method, path)) return payload;

    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const response = { ...(payload as Record<string, unknown>) };

      // Surface on-chain reverts: when the relayer was called with
      // `wait=true` it returns `{ success: false, status: "failure", error,
      // tx_hash }`. Without this throw, callers (and integration tests) see a
      // plausible-looking object and never learn the chain rejected the tx.
      const explicitFailure =
        response.success === false || response.status === 'failure';
      if (explicitFailure) {
        const txHash =
          (typeof response.txHash === 'string' && response.txHash) ||
          (typeof response.tx_hash === 'string' && response.tx_hash) ||
          undefined;
        const message =
          (typeof response.error === 'string' && response.error) ||
          'Transaction reverted on-chain';
        throw new RelayExecutionError(message, txHash, payload);
      }

      if (typeof response.txHash === 'string') return response as T;
      if (typeof response.tx_hash === 'string') {
        response.txHash = response.tx_hash;
        return response as T;
      }
      if (typeof response.transactionHash === 'string') {
        response.txHash = response.transactionHash;
        return response as T;
      }
      if (typeof response.transaction_hash === 'string') {
        response.txHash = response.transaction_hash;
        return response as T;
      }

      if (response.ok === undefined) response.ok = true;
      if (response.raw === undefined) response.raw = payload;
      return response as T;
    }

    return { ok: true, raw: payload } as T;
  }

  /** JSON request. */
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = this._headers(
      body !== undefined ? { 'Content-Type': 'application/json' } : undefined
    );

    // Inject actor_id for API-key POST requests to compose/relay endpoints
    let resolved = body;
    if (
      this._actorId &&
      this._apiKey &&
      method === 'POST' &&
      body &&
      typeof body === 'object' &&
      !Array.isArray(body) &&
      (path.startsWith('/compose/') || path.startsWith('/relay/'))
    ) {
      resolved = {
        ...(body as Record<string, unknown>),
        actor_id: this._actorId,
      };
    }

    const res = await this._fetch(url, {
      method,
      headers,
      body: resolved !== undefined ? JSON.stringify(resolved) : undefined,
    });

    if (!res.ok) {
      const err: ApiError = await res.json().catch(() => ({
        error: `HTTP ${res.status}`,
      }));
      throw new OnSocialError(res.status, err);
    }

    const payload = (await res.json()) as T;
    return this._normalizeMutationResponse(path, method, payload);
  }

  /** Multipart form-data request (for file uploads). */
  async requestForm<T>(
    method: string,
    path: string,
    form: FormData
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    // Don't set Content-Type — browser/node will add boundary automatically
    const headers = this._headers();

    const res = await this._fetch(url, { method, headers, body: form });

    if (!res.ok) {
      const err: ApiError = await res.json().catch(() => ({
        error: `HTTP ${res.status}`,
      }));
      throw new OnSocialError(res.status, err);
    }

    const payload = (await res.json()) as T;
    return this._normalizeMutationResponse(path, method, payload);
  }

  /** GET shorthand. */
  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  /** POST shorthand (JSON). */
  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  /** DELETE shorthand. */
  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}

// ── Error class ─────────────────────────────────────────────────────────────

export class OnSocialError extends Error {
  status: number;
  details?: string;
  retryAfter?: number;

  constructor(status: number, body: ApiError) {
    super(body.error);
    this.name = 'OnSocialError';
    this.status = status;
    this.details = body.details;
    this.retryAfter = body.retryAfter;
  }
}

/**
 * Thrown when the relayer broadcasts a transaction with `wait=true` and the
 * on-chain receipt resolves to `Failure` (the transaction reverted).
 *
 * Distinct from `OnSocialError` (HTTP-level errors): `RelayExecutionError`
 * means the relay POST itself succeeded with HTTP 200 but the chain rejected
 * the transaction — for example, a contract assertion fired, gas ran out, or
 * a permission check failed.
 */
export class RelayExecutionError extends Error {
  txHash?: string;
  raw?: unknown;

  constructor(message: string, txHash?: string, raw?: unknown) {
    super(message);
    this.name = 'RelayExecutionError';
    this.txHash = txHash;
    this.raw = raw;
  }
}
