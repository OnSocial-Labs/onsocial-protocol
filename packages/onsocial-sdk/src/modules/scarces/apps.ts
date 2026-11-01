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

/**
 * Who may create collections under an app.
 * - `open` — any account (default)
 * - `approval` — owner, moderators, or explicitly approved creators
 * - `invite_only` — owner, moderators, or creators the house adds. No requests.
 */
export type CreatorAccess = 'open' | 'approval' | 'invite_only';

/** Optional config fields for `register` and `setConfig`. */
export interface AppConfigInput {
  maxUserBytes?: number;
  defaultRoyalty?: Record<string, number>;
  primarySaleBps?: number;
  /** @deprecated Prefer `creatorAccess`. `true` maps to `invite_only`. */
  curated?: boolean;
  creatorAccess?: CreatorAccess;
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
      this._relayOpts({ confirmation: true })
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

  /**
   * Approve a creator to make collections under this app.
   * Only takes effect when the app's `creatorAccess` is `approval`.
   */
  async addApprovedCreator(
    appId: string,
    accountId: string
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.ADD_APPROVED_CREATOR,
      {
        appId,
        accountId,
      },
      'scarces.addApprovedCreator',
      this._relayOpts({ confirmation: true })
    );
  }

  /**
   * Approve several creators in one tx (max 20). Skips already-approved
   * on-chain; only takes effect when `creatorAccess` is `approval`.
   */
  async addApprovedCreators(
    appId: string,
    accountIds: string[]
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.ADD_APPROVED_CREATORS,
      {
        appId,
        accountIds,
      },
      'scarces.addApprovedCreators',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Remove a creator from the app's approved-creator roster. */
  async removeApprovedCreator(
    appId: string,
    accountId: string
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.REMOVE_APPROVED_CREATOR,
      {
        appId,
        accountId,
      },
      'scarces.removeApprovedCreator',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Ask to publish in an approval hub. */
  async requestPublish(
    appId: string,
    message?: string
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.REQUEST_PUBLISH,
      {
        appId,
        ...(message ? { message } : {}),
      },
      'scarces.requestPublish',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Withdraw your pending publish request. */
  async cancelPublishRequest(appId: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.CANCEL_PUBLISH_REQUEST,
      { appId },
      'scarces.cancelPublishRequest',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Decline a pending publish request. Hub owner or moderator. */
  async declinePublishRequest(
    appId: string,
    accountId: string
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.DECLINE_PUBLISH_REQUEST,
      { appId, accountId },
      'scarces.declinePublishRequest',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Block a pending or declined requester from asking again. */
  async blockPublishRequester(
    appId: string,
    accountId: string
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.BLOCK_PUBLISH_REQUESTER,
      { appId, accountId },
      'scarces.blockPublishRequester',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Remove a block. Does not approve the account. */
  async unblockPublishRequester(
    appId: string,
    accountId: string
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.UNBLOCK_PUBLISH_REQUESTER,
      { appId, accountId },
      'scarces.unblockPublishRequester',
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
