// ---------------------------------------------------------------------------
// Collections — create, mintFrom, purchaseFrom, airdrop, pause, resume, delete.
// ---------------------------------------------------------------------------

import type { HttpClient } from '../../http.js';
import type { StorageProvider } from '../../storage/provider.js';
import type { CollectionOptions, RelayResponse } from '../../types.js';
import { buildCreateCollectionAction } from '../../builders/scarces/collections.js';
import { hasLocalUpload, resolveScarceMedia } from './_media.js';

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
}
