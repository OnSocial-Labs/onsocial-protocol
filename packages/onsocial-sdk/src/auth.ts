// ---------------------------------------------------------------------------
// OnSocial SDK — auth module
// ---------------------------------------------------------------------------

import type { HttpClient } from './http.js';
import type { AuthInfo, LoginRequest, LoginResponse } from './types.js';

export class AuthModule {
  constructor(private _http: HttpClient) {}

  /**
   * Login with a NEAR signature.
   *
   * ```ts
   * const session = await os.auth.login({
   *   accountId: 'alice.near',
   *   message: `OnSocial Auth: ${Date.now()}`,
   *   signature: base64Sig,
   *   publicKey: 'ed25519:...',
   * });
   * ```
   */
  async login(req: LoginRequest): Promise<LoginResponse> {
    const res = await this._http.post<LoginResponse>('/auth/login', req);
    this._http.setToken(res.token);
    return res;
  }

  /** Refresh the current JWT. */
  async refresh(): Promise<LoginResponse> {
    const res = await this._http.post<LoginResponse>('/auth/refresh');
    this._http.setToken(res.token);
    return res;
  }

  /** Get current user info. */
  me(): Promise<AuthInfo> {
    return this._http.get<AuthInfo>('/auth/me');
  }

  /** Manually set a pre-obtained JWT. */
  setToken(token: string): void {
    this._http.setToken(token);
  }

  /** Clear credentials. */
  logout(): void {
    this._http.clearToken();
  }
}
