// ---------------------------------------------------------------------------
// Apps — register / configure / fund / moderate apps that host scarces
// collections. Mirrors the contract's `app_pool` namespace.
// ---------------------------------------------------------------------------

import type { HttpClient } from '../../internal/http.js';
import type { RelayResponse } from '../../types.js';
import {
  composeAndSign,
  type SessionGetter,
  type BroadcastGetter,
} from '../../internal/session-bridge.js';
import { SCARCES_VERBS } from './verbs.js';

/** Optional config fields for `register` and `setConfig`. */
export interface AppConfigInput {
  maxUserBytes?: number;
  defaultRoyalty?: Record<string, number>;
  primarySaleBps?: number;
  curated?: boolean;
  metadata?: string;
}

export class ScarcesAppsApi {
  constructor(
    private _http: HttpClient,
    private _getSession: SessionGetter,
    private _getBroadcast?: BroadcastGetter
  ) {}

  private _broadcastOpts():
    | { broadcast: ReturnType<BroadcastGetter> }
    | undefined {
    const b = this._getBroadcast?.();
    return b !== undefined ? { broadcast: b } : undefined;
  }

  /** Register a new app. Caller becomes the initial owner. */
  async register(
    appId: string,
    config: AppConfigInput = {}
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.REGISTER_APP,
      {
        appId,
        ...config,
      },
      'scarces.registerApp',
      this._broadcastOpts()
    );
  }

  /** Update an existing app's config (owner only). */
  async setConfig(
    appId: string,
    config: AppConfigInput
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.SET_APP_CONFIG,
      {
        appId,
        ...config,
      },
      'scarces.setAppConfig',
      this._broadcastOpts()
    );
  }

  /** Fund the app's reward pool by attaching deposit. */
  async fundPool(appId: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.FUND_APP_POOL,
      { appId },
      'scarces.fundAppPool',
      this._broadcastOpts()
    );
  }

  /** Withdraw NEAR from the app's reward pool (owner). */
  async withdrawPool(
    appId: string,
    amountNear: string
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.WITHDRAW_APP_POOL,
      {
        appId,
        amountNear,
      },
      'scarces.withdrawAppPool',
      this._broadcastOpts()
    );
  }

  /** Transfer app ownership to another account. */
  async transferOwnership(
    appId: string,
    newOwner: string
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.TRANSFER_APP_OWNERSHIP,
      {
        appId,
        newOwner,
      },
      'scarces.transferAppOwnership',
      this._broadcastOpts()
    );
  }

  /** Add a moderator to the app. */
  async addModerator(appId: string, accountId: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.ADD_MODERATOR,
      {
        appId,
        accountId,
      },
      'scarces.addModerator',
      this._broadcastOpts()
    );
  }

  /** Remove a moderator from the app. */
  async removeModerator(
    appId: string,
    accountId: string
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.REMOVE_MODERATOR,
      {
        appId,
        accountId,
      },
      'scarces.removeModerator',
      this._broadcastOpts()
    );
  }

  /** Ban a collection from the app (owner / moderator). */
  async banCollection(
    appId: string,
    collectionId: string,
    reason?: string
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.BAN_COLLECTION,
      {
        appId,
        collectionId,
        reason,
      },
      'scarces.banCollection',
      this._broadcastOpts()
    );
  }

  /** Lift a previous ban on a collection within the app. */
  async unbanCollection(
    appId: string,
    collectionId: string
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.UNBAN_COLLECTION,
      {
        appId,
        collectionId,
      },
      'scarces.unbanCollection',
      this._broadcastOpts()
    );
  }
}
