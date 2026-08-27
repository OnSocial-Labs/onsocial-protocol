// ---------------------------------------------------------------------------
// OnSocial SDK — auth module
// ---------------------------------------------------------------------------

import type { HttpClient } from './http.js';
import {
  parseAppHandoffFromUrl,
  type AppHandoffParams,
} from '../auth-handoff.js';
import type {
  AppSessionResponse,
  AuthInfo,
  LoginRequest,
  LoginResponse,
} from '../types.js';

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

  /**
   * Exchange a launcher handoff code for an app-scoped JWT.
   * Reads `onsocial_code` / `onsocial_app` from `url` or `window.location`
   * when `code` / `appId` are omitted. Does not mint a refresh cookie.
   */
  async completeAppHandoff(
    input: Partial<AppHandoffParams> & { url?: string } = {}
  ): Promise<AppSessionResponse> {
    const parsed = parseAppHandoffFromUrl(
      input.url ?? (typeof window === 'undefined' ? '' : window.location.href)
    );
    const code = (input.code ?? parsed?.code ?? '').trim();
    const appId = (input.appId ?? parsed?.appId ?? '').trim().toLowerCase();
    if (!code || !appId) {
      throw new Error('Missing onsocial_code or onsocial_app');
    }
    const res = await this._http.post<AppSessionResponse>('/auth/app-session', {
      code,
      appId,
    });
    this._http.setToken(res.token);
    return res;
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
