// ---------------------------------------------------------------------------
// Collections — create, mintFrom, purchaseFrom, airdrop, pause, resume, delete.
// ---------------------------------------------------------------------------

import type { HttpClient } from '../../http.js';
import type { StorageProvider } from '../../storage/provider.js';
import type { CollectionOptions, RelayResponse } from '../../types.js';
import { buildCreateCollectionAction } from '../../builders/scarces/collections.js';
import { hasLocalUpload, resolveScarceMedia } from './_media.js';

/** Allowlist entry as accepted by the scarces contract. */
export interface AllowlistEntry {
  account_id: string;
  allocation: number;
}

export class ScarcesCollectionsApi {
  constructor(
    private _http: HttpClient,
    private _storage?: StorageProvider
  ) {}

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
    if (hasLocalUpload(this._storage, opts.image)) {
      const { mediaCid, mediaHash } = await resolveScarceMedia(
        opts,
        this._storage
      );
      const action = buildCreateCollectionAction({
        ...opts,
        ...(mediaCid ? { mediaCid } : {}),
        ...(mediaHash ? { mediaHash } : {}),
      });
      return this._http.post<RelayResponse>('/relay/execute', { action });
    }

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
    return this._http.requestForm<RelayResponse>(
      'POST',
      '/compose/create-collection',
      form
    );
  }

  /** Mint from an existing collection. */
  async mintFrom(
    collectionId: string,
    quantity = 1,
    receiverId?: string
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/mint-from-collection', {
      collectionId,
      quantity,
      receiverId,
    });
  }

  /** Purchase from a collection (pay priceNear per token). */
  async purchaseFrom(
    collectionId: string,
    maxPricePerTokenNear: string,
    quantity = 1
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/purchase-from-collection', {
      collectionId,
      quantity,
      maxPricePerTokenNear,
    });
  }

  /** Airdrop scarces from a collection to multiple receivers. */
  async airdrop(
    collectionId: string,
    receivers: string[]
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/airdrop-from-collection', {
      collectionId,
      receivers,
    });
  }

  /** Pause minting on a collection. */
  async pause(collectionId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/pause-collection', {
      collectionId,
    });
  }

  /** Resume minting on a collection. */
  async resume(collectionId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/resume-collection', {
      collectionId,
    });
  }

  /** Delete a collection (must be empty). */
  async delete(collectionId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/delete-collection', {
      collectionId,
    });
  }

  /** Update the per-token price of a collection (creator only). */
  async updatePrice(
    collectionId: string,
    newPriceNear: string
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/update-collection-price', {
      collectionId,
      newPriceNear,
    });
  }

  /** Update collection start/end timestamps (ns). */
  async updateTiming(
    collectionId: string,
    opts: { startTime?: number; endTime?: number }
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/update-collection-timing', {
      collectionId,
      startTime: opts.startTime,
      endTime: opts.endTime,
    });
  }

  /** Replace the collection allowlist with `entries`. */
  async setAllowlist(
    collectionId: string,
    entries: AllowlistEntry[]
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/set-allowlist', {
      collectionId,
      entries,
    });
  }

  /** Remove specific accounts from the collection allowlist. */
  async removeFromAllowlist(
    collectionId: string,
    accounts: string[]
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/remove-from-allowlist', {
      collectionId,
      accounts,
    });
  }

  /** Set or clear the collection's freeform metadata blob. */
  async setMetadata(
    collectionId: string,
    metadata: string | null
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/set-collection-metadata', {
      collectionId,
      metadata,
    });
  }

  /** Set or clear the per-app metadata for a collection (app owner). */
  async setAppMetadata(
    appId: string,
    collectionId: string,
    metadata: string | null
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>(
      '/compose/set-collection-app-metadata',
      { appId, collectionId, metadata }
    );
  }

  /** Cancel a collection and offer per-token refunds until `refundDeadlineNs`. */
  async cancel(
    collectionId: string,
    refundPerTokenNear: string,
    refundDeadlineNs?: number
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/cancel-collection', {
      collectionId,
      refundPerTokenNear,
      refundDeadlineNs,
    });
  }

  /** After the refund window, reclaim unclaimed refund balances (creator). */
  async withdrawUnclaimedRefunds(collectionId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>(
      '/compose/withdraw-unclaimed-refunds',
      { collectionId }
    );
  }
}
