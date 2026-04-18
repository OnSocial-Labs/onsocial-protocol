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

    return res.json() as Promise<T>;
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

    return res.json() as Promise<T>;
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
