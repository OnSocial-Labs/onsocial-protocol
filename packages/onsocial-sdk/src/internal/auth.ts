// ---------------------------------------------------------------------------
// OnSocial SDK — auth module
// ---------------------------------------------------------------------------

import type { HttpClient } from './http.js';
import {
  persistSessionFromKey,
  localStorageKeyStore,
} from '../advanced/bootstrap.js';
import type { Session } from '../advanced/session.js';
import {
  prepareAppHandoffKey,
  restoreAppHandoffSessionKey,
} from '../auth-handoff-key.js';
import {
  clearAppHandoffSession,
  readAppHandoffSession,
  writeAppHandoffSession,
} from '../auth-handoff-session.js';
import {
  buildOsAppHandoffUrl,
  communityAppSessionPath,
  normalizeAppId,
  parseAppHandoffFromUrl,
  stripAppHandoffFromUrl,
  type AppHandoffParams,
} from '../auth-handoff.js';
import type {
  AppSessionResponse,
  AuthInfo,
  LoginRequest,
  LoginResponse,
} from '../types.js';

export const COMMUNITY_APP_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const COMMUNITY_APP_SESSION_ALLOWANCE_YOCTO = '250000000000000000000000';

export type AuthModuleHooks = {
  attachSession?: (session: Session) => void;
};

export class AuthModule {
  private _appId: string | null = null;
  private _refreshing: Promise<boolean> | null = null;

  constructor(
    private _http: HttpClient,
    private _hooks: AuthModuleHooks = {}
  ) {}

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
   * Exchange a launcher / Continue-with-OnSocial code for an app-scoped JWT
   * and attach the dapp-held session key when one was prepared.
   *
   * Returning visits restore from the stored app refresh token — no OS bounce.
   * Pass `osOrigin` in the browser so a first visit redirects to OS to grant
   * `apps/<appId>/`.
   */
  async completeAppHandoff(
    input: Partial<AppHandoffParams> & {
      url?: string;
      osOrigin?: string;
      /** Strip handoff params from the current URL. Default true in the browser. */
      replaceUrl?: boolean;
    } = {}
  ): Promise<AppSessionResponse & { sessionAttached: boolean }> {
    const parsed = parseAppHandoffFromUrl(
      input.url ?? (typeof window === 'undefined' ? '' : window.location.href)
    );
    const appId =
      (input.appId ? normalizeAppId(input.appId) : null) ?? parsed?.appId ?? '';
    const code = (input.code ?? parsed?.code ?? '').trim();
    const osOrigin = input.osOrigin?.trim().replace(/\/$/, '') ?? '';

    if (!code) {
      if (appId) {
        const restored = await this.restoreAppSession(appId);
        if (restored) return restored;
      }
      if (osOrigin && appId && typeof window !== 'undefined') {
        await this.startOnSocialHandoff({ osOrigin, appId });
        return new Promise(() => undefined);
      }
      throw new Error('Missing onsocial_code or onsocial_app');
    }
    if (!appId) {
      throw new Error('Missing onsocial_code or onsocial_app');
    }

    const res = await this._http.post<AppSessionResponse>('/auth/app-session', {
      code,
      appId,
    });
    const accepted = await this._acceptAppSession(res);

    const sessionKey = await restoreAppHandoffSessionKey(appId);
    if (!sessionKey && osOrigin && typeof window !== 'undefined') {
      await this.startOnSocialHandoff({ osOrigin, appId });
      return new Promise(() => undefined);
    }

    const replaceUrl = input.replaceUrl ?? typeof window !== 'undefined';
    if (replaceUrl && typeof window !== 'undefined') {
      window.history.replaceState(
        window.history.state,
        '',
        stripAppHandoffFromUrl(window.location.href)
      );
    }
    return accepted;
  }

  /**
   * Restore an app-scoped JWT from the refresh token stored on this origin.
   * Used on later visits and by the HTTP 401 retry.
   */
  async restoreAppSession(
    appId: string
  ): Promise<(AppSessionResponse & { sessionAttached: boolean }) | null> {
    const id = normalizeAppId(appId);
    if (!id) return null;
    const stored = readAppHandoffSession(id);
    if (!stored) return null;
    try {
      const res = await this._http.post<AppSessionResponse>(
        '/auth/app-refresh',
        { refreshToken: stored.refreshToken, appId: id }
      );
      return this._acceptAppSession(res);
    } catch {
      return null;
    }
  }

  /**
   * Rotate the stored app refresh token after a 401. Single-flight.
   */
  refreshAppAccess(): Promise<boolean> {
    if (this._refreshing) return this._refreshing;
    this._refreshing = this._refreshAppAccess().finally(() => {
      this._refreshing = null;
    });
    return this._refreshing;
  }

  /**
   * Create (or reuse) a session keypair on this origin, then send the visitor
   * to OnSocial. OS grants `apps/<appId>/` to that public key and returns
   * them with a one-time code.
   */
  async startOnSocialHandoff(input: {
    osOrigin: string;
    appId: string;
  }): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('startOnSocialHandoff requires a browser');
    }
    const key = await prepareAppHandoffKey(input.appId, input.osOrigin);
    window.location.assign(
      buildOsAppHandoffUrl(input.osOrigin, input.appId, key.publicKey)
    );
  }

  /** Manually set a pre-obtained JWT. */
  setToken(token: string): void {
    this._http.setToken(token);
  }

  /** Clear credentials. */
  logout(): void {
    this._http.clearToken();
    if (this._appId) clearAppHandoffSession(this._appId);
    this._appId = null;
  }

  private async _refreshAppAccess(): Promise<boolean> {
    if (!this._appId) return false;
    const restored = await this.restoreAppSession(this._appId);
    return restored !== null;
  }

  private async _acceptAppSession(
    res: AppSessionResponse
  ): Promise<AppSessionResponse & { sessionAttached: boolean }> {
    this._http.setToken(res.token);
    this._appId = res.appId;
    if (res.refreshToken) {
      writeAppHandoffSession({
        appId: res.appId,
        accountId: res.accountId,
        refreshToken: res.refreshToken,
      });
    }

    let sessionAttached = false;
    const sessionKey = await restoreAppHandoffSessionKey(res.appId);
    if (sessionKey) {
      const session = await persistSessionFromKey({
        network: this._http.network,
        accountId: res.accountId,
        sessionKey,
        contract: 'core',
        path: communityAppSessionPath(res.appId),
        ttlMs: COMMUNITY_APP_SESSION_TTL_MS,
        functionCallKey: {
          methodNames: ['execute'],
          allowanceYocto: COMMUNITY_APP_SESSION_ALLOWANCE_YOCTO,
        },
        store:
          typeof window === 'undefined'
            ? undefined
            : localStorageKeyStore('onsocial.community.session.'),
      });
      this._hooks.attachSession?.(session);
      sessionAttached = true;
    }

    return { ...res, sessionAttached };
  }
}
