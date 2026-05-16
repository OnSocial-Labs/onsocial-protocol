// ---------------------------------------------------------------------------
// Collections — create, mintFrom, purchaseFrom, airdrop, pause, resume, delete.
// ---------------------------------------------------------------------------

import type { HttpClient } from '../../internal/http.js';
import type { StorageProvider } from '../../storage/provider.js';
import type { CollectionOptions, RelayResponse } from '../../types.js';
import {
  composeAndSign,
  composeFormAndSign,
  signAndRelay,
  type SessionGetter,
  type BroadcastGetter,
} from '../../internal/session-bridge.js';
import { SCARCES_VERBS } from './verbs.js';
import { resolveContractId } from '../../internal/contracts.js';
import { buildCreateCollectionAction } from '../../builders/scarces/collections.js';
import { hasLocalUpload, resolveScarceMedia } from './_media.js';
import { scarcesRelayOptions } from './_relay.js';

/** Allowlist entry as accepted by the scarces contract. */
export interface AllowlistEntry {
  account_id: string;
  allocation: number;
}

export class ScarcesCollectionsApi {
  private _scarcesContract: string;

  constructor(
    private _http: HttpClient,
    private _getSession: SessionGetter,
    private _storage?: StorageProvider,
    private _getBroadcast?: BroadcastGetter
  ) {
    this._scarcesContract = resolveContractId(_http.network, 'scarces');
  }

  private _relayOpts(opts?: { confirmation?: boolean }) {
    return scarcesRelayOptions(this._getBroadcast, opts);
  }

  /**
   * Create a collection for batch / drop minting.
   *
   * ```ts
   * await os.scarces.collections.create({
   *   collectionId: 'genesis',
   *   totalSupply: 1000,
   *   title: 'Genesis Collection',
   *   priceNear: '1',
   * });
   * ```
   */
  async create(opts: CollectionOptions): Promise<RelayResponse> {
    if (hasLocalUpload(this._storage, opts.image, opts.mediaCid)) {
      const { mediaCid, mediaHash } = await resolveScarceMedia(
        opts,
        this._storage
      );
      const action = buildCreateCollectionAction({
        ...opts,
        ...(mediaCid ? { mediaCid } : {}),
        ...(mediaHash ? { mediaHash } : {}),
      });
      return signAndRelay(
        this._http,
        this._getSession(),
        action as Record<string, unknown>,
        this._scarcesContract,
        'scarces.collections.create',
        this._relayOpts()
      );
    }

    // FormData upload route — gateway uploads media + builds the action,
    // SDK signs with the session key and relays via /relay/delegate.
    const form = new FormData();
    form.append('collectionId', opts.collectionId);
    form.append('totalSupply', String(opts.totalSupply));
    form.append('title', opts.title);
    if (opts.priceNear) form.append('priceNear', opts.priceNear);
    if (opts.description) form.append('description', opts.description);
    if (opts.royalty) form.append('royalty', JSON.stringify(opts.royalty));
    if (opts.extra) form.append('extra', JSON.stringify(opts.extra));
    if (opts.startTime) form.append('startTime', opts.startTime);
    if (opts.endTime) form.append('endTime', opts.endTime);
    if (opts.appId) form.append('appId', opts.appId);
    if (opts.mintMode) form.append('mintMode', opts.mintMode);
    if (opts.maxPerWallet)
      form.append('maxPerWallet', String(opts.maxPerWallet));
    if (opts.renewable !== undefined)
      form.append('renewable', String(opts.renewable));
    if (opts.transferable !== undefined)
      form.append('transferable', String(opts.transferable));
    if (opts.burnable !== undefined)
      form.append('burnable', String(opts.burnable));
    if (opts.mediaCid) form.append('mediaCid', opts.mediaCid);
    if (opts.mediaHash) form.append('mediaHash', opts.mediaHash);
    if (opts.image) form.append('image', opts.image);

    const result = await composeFormAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.CREATE_COLLECTION,
      form,
      'scarces.collections.create',
      this._relayOpts()
    );
    return result.relay;
  }

  /** Mint from an existing collection. */
  async mintFrom(
    collectionId: string,
    quantity = 1,
    receiverId?: string
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.MINT_FROM_COLLECTION,
      {
        collectionId,
        quantity,
        receiverId,
      },
      'scarces.mintFromCollection',
      this._relayOpts()
    );
  }

  /** Purchase from a collection (pay priceNear per token). */
  async purchaseFrom(
    collectionId: string,
    maxPricePerTokenNear: string,
    quantity = 1
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.PURCHASE_FROM_COLLECTION,
      {
        collectionId,
        quantity,
        maxPricePerTokenNear,
      },
      'scarces.purchaseFromCollection',
      this._relayOpts()
    );
  }

  /** Airdrop scarces from a collection to multiple receivers. */
  async airdrop(
    collectionId: string,
    receivers: string[]
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.AIRDROP_FROM_COLLECTION,
      {
        collectionId,
        receivers,
      },
      'scarces.airdropFromCollection',
      this._relayOpts()
    );
  }

  /** Pause minting on a collection. */
  async pause(collectionId: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.PAUSE_COLLECTION,
      {
        collectionId,
      },
      'scarces.pauseCollection',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Resume minting on a collection. */
  async resume(collectionId: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.RESUME_COLLECTION,
      {
        collectionId,
      },
      'scarces.resumeCollection',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Delete a collection (must be empty). */
  async delete(collectionId: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.DELETE_COLLECTION,
      {
        collectionId,
      },
      'scarces.deleteCollection',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Update the per-token price of a collection (creator only). */
  async updatePrice(
    collectionId: string,
    newPriceNear: string
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.UPDATE_COLLECTION_PRICE,
      {
        collectionId,
        newPriceNear,
      },
      'scarces.updateCollectionPrice',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Update collection start/end timestamps (ns). */
  async updateTiming(
    collectionId: string,
    opts: { startTime?: number; endTime?: number }
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.UPDATE_COLLECTION_TIMING,
      {
        collectionId,
        startTime: opts.startTime,
        endTime: opts.endTime,
      },
      'scarces.updateCollectionTiming',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Replace the collection allowlist with `entries`. */
  async setAllowlist(
    collectionId: string,
    entries: AllowlistEntry[]
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.SET_ALLOWLIST,
      {
        collectionId,
        entries,
      },
      'scarces.setAllowlist',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Remove specific accounts from the collection allowlist. */
  async removeFromAllowlist(
    collectionId: string,
    accounts: string[]
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.REMOVE_FROM_ALLOWLIST,
      {
        collectionId,
        accounts,
      },
      'scarces.removeFromAllowlist',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Set or clear the collection's freeform metadata blob. */
  async setMetadata(
    collectionId: string,
    metadata: string | null
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.SET_COLLECTION_METADATA,
      {
        collectionId,
        metadata,
      },
      'scarces.setCollectionMetadata',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Set or clear the per-app metadata for a collection (app owner). */
  async setAppMetadata(
    appId: string,
    collectionId: string,
    metadata: string | null
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.SET_COLLECTION_APP_METADATA,
      { appId, collectionId, metadata },
      'scarces.setCollectionAppMetadata',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Cancel a collection and offer per-token refunds until `refundDeadlineNs`. */
  async cancel(
    collectionId: string,
    refundPerTokenNear: string,
    refundDeadlineNs?: number
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.CANCEL_COLLECTION,
      {
        collectionId,
        refundPerTokenNear,
        refundDeadlineNs,
      },
      'scarces.cancelCollection',
      this._relayOpts()
    );
  }

  /** After the refund window, reclaim unclaimed refund balances (creator). */
  async withdrawUnclaimedRefunds(collectionId: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.WITHDRAW_UNCLAIMED_REFUNDS,
      { collectionId },
      'scarces.withdrawUnclaimedRefunds',
      this._relayOpts({ confirmation: true })
    );
  }
}
