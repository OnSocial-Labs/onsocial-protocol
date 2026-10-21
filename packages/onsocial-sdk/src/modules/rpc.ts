/**
 * Raw NEAR JSON-RPC through the OnAPI gateway.
 *
 * Same host and key as the rest of the SDK. The gateway serves one network
 * and counts the call against the key's minute budget.
 */

import type { HttpClient } from '../internal/http.js';

export interface RpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

/** JSON-RPC error returned with HTTP 200 (method rejected, archival tier, …). */
export class RpcError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.data = data;
  }
}

/**
 * What `near-api-js` `JsonRpcProvider` accepts. The key is already on
 * `headers`, so callers do not build the URL themselves.
 */
export interface NearProviderOptions {
  url: string;
  headers: Record<string, string>;
}

export class RpcModule {
  constructor(private _http: HttpClient) {}

  /** `https://testnet.onsocial.id/v1/rpc` for a testnet client. */
  get url(): string {
    return `${this._http.baseUrl}/v1/rpc`;
  }

  /**
   * Provider options for `new JsonRpcProvider(os.rpc.nearProvider())`.
   * Includes the OnAPI key or session token the client was constructed with.
   */
  nearProvider(): NearProviderOptions {
    return {
      url: this.url,
      headers: this._http.authHeaders(),
    };
  }

  /**
   * One JSON-RPC call. Returns the `result`. A JSON-RPC error throws
   * `RpcError`. HTTP failures (auth, rate limit, upstream down) throw
   * `OnSocialError`.
   */
  async call<T = unknown>(method: string, params: unknown = {}): Promise<T> {
    const body = await this._http.post<RpcResponse<T>>('/v1/rpc', {
      jsonrpc: '2.0',
      id: 'onsocial',
      method,
      params,
    });
    if (body.error) {
      throw new RpcError(body.error.code, body.error.message, body.error.data);
    }
    return body.result as T;
  }
}
