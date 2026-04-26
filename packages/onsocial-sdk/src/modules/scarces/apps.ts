// ---------------------------------------------------------------------------
// Apps — register / configure / fund / moderate apps that host scarces
// collections. Mirrors the contract's `app_pool` namespace.
// ---------------------------------------------------------------------------

import type { HttpClient } from '../../http.js';
import type { RelayResponse } from '../../types.js';

/** Optional config fields for `register` and `setConfig`. */
export interface AppConfigInput {
  maxUserBytes?: number;
  defaultRoyalty?: Record<string, number>;
  primarySaleBps?: number;
  curated?: boolean;
  metadata?: string;
}

export class ScarcesAppsApi {
  constructor(private _http: HttpClient) {}

  /** Register a new app. Caller becomes the initial owner. */
  async register(
    appId: string,
    config: AppConfigInput = {}
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/register-app', {
      appId,
      ...config,
    });
  }

  /** Update an existing app's config (owner only). */
  async setConfig(
    appId: string,
    config: AppConfigInput
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/set-app-config', {
      appId,
      ...config,
    });
  }

  /** Fund the app's reward pool by attaching deposit. */
  async fundPool(appId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/fund-app-pool', { appId });
  }

  /** Withdraw NEAR from the app's reward pool (owner). */
  async withdrawPool(
    appId: string,
    amountNear: string
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/withdraw-app-pool', {
      appId,
      amountNear,
    });
  }

  /** Transfer app ownership to another account. */
  async transferOwnership(
    appId: string,
    newOwner: string
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/transfer-app-ownership', {
      appId,
      newOwner,
    });
  }

  /** Add a moderator to the app. */
  async addModerator(appId: string, accountId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/add-moderator', {
      appId,
      accountId,
    });
  }

  /** Remove a moderator from the app. */
  async removeModerator(
    appId: string,
    accountId: string
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/remove-moderator', {
      appId,
      accountId,
    });
  }

  /** Ban a collection from the app (owner / moderator). */
  async banCollection(
    appId: string,
    collectionId: string,
    reason?: string
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/ban-collection', {
      appId,
      collectionId,
      reason,
    });
  }

  /** Lift a previous ban on a collection within the app. */
  async unbanCollection(
    appId: string,
    collectionId: string
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/unban-collection', {
      appId,
      collectionId,
    });
  }
}
