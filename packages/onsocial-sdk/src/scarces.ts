// ---------------------------------------------------------------------------
// OnSocial SDK — scarces module (NFTs: mint, collections, marketplace, offers)
// ---------------------------------------------------------------------------

import type { HttpClient } from './http.js';
import type {
  AuctionOptions,
  CollectionOfferOptions,
  CollectionOptions,
  LazyListingOptions,
  ListingOptions,
  MintOptions,
  MintResponse,
  OfferOptions,
  RelayResponse,
} from './types.js';

export class ScarcesModule {
  constructor(private _http: HttpClient) {}

  // ── Minting ─────────────────────────────────────────────────────────────

  /**
   * Mint a scarce (NFT) with optional image upload.
   *
   * ```ts
   * const file = new File([bytes], 'art.png', { type: 'image/png' });
   * await os.scarces.mint({ title: 'My Art', image: file });
   * ```
   */
  async mint(opts: MintOptions): Promise<MintResponse> {
    const form = new FormData();
    form.append('title', opts.title);
    if (opts.description) form.append('description', opts.description);
    if (opts.copies) form.append('copies', String(opts.copies));
    if (opts.collectionId) form.append('collectionId', opts.collectionId);
    if (opts.royalty) form.append('royalty', JSON.stringify(opts.royalty));
    if (opts.extra) form.append('extra', JSON.stringify(opts.extra));
    if (opts.appId) form.append('appId', opts.appId);
    if (opts.receiverId) form.append('receiverId', opts.receiverId);
    if (opts.mediaCid) form.append('mediaCid', opts.mediaCid);
    if (opts.mediaHash) form.append('mediaHash', opts.mediaHash);
    if (opts.image) form.append('image', opts.image);

    return this._http.requestForm<MintResponse>('POST', '/compose/mint', form);
  }

  // ── Collections ─────────────────────────────────────────────────────────

  /**
   * Create a collection for batch minting.
   *
   * ```ts
   * await os.scarces.createCollection({
   *   collectionId: 'genesis',
   *   totalSupply: 1000,
   *   title: 'Genesis Collection',
   *   priceNear: '1',
   * });
   * ```
   */
  async createCollection(opts: CollectionOptions): Promise<RelayResponse> {
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
    if (opts.maxPerWallet) form.append('maxPerWallet', String(opts.maxPerWallet));
    if (opts.renewable !== undefined) form.append('renewable', String(opts.renewable));
    if (opts.transferable !== undefined) form.append('transferable', String(opts.transferable));
    if (opts.burnable !== undefined) form.append('burnable', String(opts.burnable));
    if (opts.image) form.append('image', opts.image);

    return this._http.requestForm<RelayResponse>(
      'POST',
      '/compose/create-collection',
      form,
    );
  }

  /** Mint from an existing collection. */
  async mintFromCollection(
    collectionId: string,
    quantity = 1,
    receiverId?: string,
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/mint-from-collection', {
      collectionId,
      quantity,
      receiverId,
    });
  }

  /** Purchase from a collection (pay priceNear per token). */
  async purchaseFromCollection(
    collectionId: string,
    maxPricePerTokenNear: string,
    quantity = 1,
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>(
      '/compose/purchase-from-collection',
      { collectionId, quantity, maxPricePerTokenNear },
    );
  }

  /** Airdrop scarces from a collection to multiple receivers. */
  async airdrop(
    collectionId: string,
    receivers: string[],
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>(
      '/compose/airdrop-from-collection',
      { collectionId, receivers },
    );
  }

  /** Pause minting on a collection. */
  async pauseCollection(collectionId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/pause-collection', {
      collectionId,
    });
  }

  /** Resume minting on a collection. */
  async resumeCollection(collectionId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/resume-collection', {
      collectionId,
    });
  }

  /** Delete a collection (must be empty). */
  async deleteCollection(collectionId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/delete-collection', {
      collectionId,
    });
  }

  // ── Lazy Listings ───────────────────────────────────────────────────────

  /**
   * Create a lazy listing (deferred-mint on purchase).
   *
   * ```ts
   * await os.scarces.createLazyListing({
   *   title: 'Limited Print',
   *   priceNear: '5',
   *   image: file,
   * });
   * ```
   */
  async createLazyListing(opts: LazyListingOptions): Promise<MintResponse> {
    const form = new FormData();
    form.append('title', opts.title);
    form.append('priceNear', opts.priceNear);
    if (opts.description) form.append('description', opts.description);
    if (opts.royalty) form.append('royalty', JSON.stringify(opts.royalty));
    if (opts.extra) form.append('extra', JSON.stringify(opts.extra));
    if (opts.appId) form.append('appId', opts.appId);
    if (opts.mediaCid) form.append('mediaCid', opts.mediaCid);
    if (opts.transferable !== undefined)
      form.append('transferable', String(opts.transferable));
    if (opts.burnable !== undefined)
      form.append('burnable', String(opts.burnable));
    if (opts.expiresAt) form.append('expiresAt', opts.expiresAt);
    if (opts.image) form.append('image', opts.image);

    return this._http.requestForm<MintResponse>(
      'POST',
      '/compose/lazy-list',
      form,
    );
  }

  /** Purchase a lazy listing (mint-on-buy). */
  async purchaseLazyListing(listingId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/purchase-lazy-listing', {
      listingId,
    });
  }

  // ── Transfers ───────────────────────────────────────────────────────────

  /** Transfer a scarce to another account. */
  async transfer(
    tokenId: string,
    receiverId: string,
    memo?: string,
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/transfer', {
      tokenId,
      receiverId,
      memo,
    });
  }

  /** Batch transfer multiple scarces. */
  async batchTransfer(
    transfers: Array<{ receiver_id: string; token_id: string; memo?: string }>,
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/batch-transfer', {
      transfers,
    });
  }

  /** Burn a scarce. */
  async burn(tokenId: string, collectionId?: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/burn', {
      tokenId,
      collectionId,
    });
  }

  // ── Marketplace ─────────────────────────────────────────────────────────

  /** List a scarce for fixed-price sale. */
  async list(opts: ListingOptions): Promise<RelayResponse> {
    return this._http.post<RelayResponse>(
      '/compose/list-native-scarce',
      opts,
    );
  }

  /** Delist a scarce from sale. */
  async delist(tokenId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/delist-native-scarce', {
      tokenId,
    });
  }

  /** Purchase a listed scarce. */
  async purchase(tokenId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/purchase-native-scarce', {
      tokenId,
    });
  }

  /** List a scarce for auction. */
  async listAuction(opts: AuctionOptions): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/list-auction', opts);
  }

  /** Place a bid on an auction. */
  async placeBid(tokenId: string, amountNear: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/place-bid', {
      tokenId,
      amountNear,
    });
  }

  /** Settle a completed auction. */
  async settleAuction(tokenId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/settle-auction', {
      tokenId,
    });
  }

  /** Cancel an auction. */
  async cancelAuction(tokenId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/cancel-auction', {
      tokenId,
    });
  }

  // ── Offers ──────────────────────────────────────────────────────────────

  /** Make an offer on a specific scarce. */
  async makeOffer(opts: OfferOptions): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/make-offer', opts);
  }

  /** Cancel an offer. */
  async cancelOffer(tokenId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/cancel-offer', {
      tokenId,
    });
  }

  /** Accept an offer on a scarce you own. */
  async acceptOffer(tokenId: string, buyerId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/accept-offer', {
      tokenId,
      buyerId,
    });
  }

  /** Make an offer on an entire collection. */
  async makeCollectionOffer(
    opts: CollectionOfferOptions,
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>(
      '/compose/make-collection-offer',
      opts,
    );
  }

  /** Cancel a collection offer. */
  async cancelCollectionOffer(collectionId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/cancel-collection-offer', {
      collectionId,
    });
  }

  /** Accept a collection offer. */
  async acceptCollectionOffer(
    collectionId: string,
    tokenId: string,
    buyerId: string,
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/accept-collection-offer', {
      collectionId,
      tokenId,
      buyerId,
    });
  }
}
