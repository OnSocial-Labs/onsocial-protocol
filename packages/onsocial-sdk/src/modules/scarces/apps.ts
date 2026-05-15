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
import { scarcesRelayOptions } from './_relay.js';

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

  private _relayOpts(opts?: { confirmation?: boolean }) {
    return scarcesRelayOptions(this._getBroadcast, opts);
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
      this._relayOpts()
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
      this._relayOpts({ confirmation: true })
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
      this._relayOpts()
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
      this._relayOpts({ confirmation: true })
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
      this._relayOpts({ confirmation: true })
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
      this._relayOpts({ confirmation: true })
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
      this._relayOpts({ confirmation: true })
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
      this._relayOpts({ confirmation: true })
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
      this._relayOpts({ confirmation: true })
    );
  }
}
