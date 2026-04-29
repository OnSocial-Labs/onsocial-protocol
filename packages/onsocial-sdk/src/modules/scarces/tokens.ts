// ---------------------------------------------------------------------------
// Tokens — mint, transfer, batch transfer, burn.
// ---------------------------------------------------------------------------

import type { HttpClient } from '../../http.js';
import type { StorageProvider } from '../../storage/provider.js';
import type { MintOptions, MintResponse, RelayResponse } from '../../types.js';
import { buildQuickMintAction } from '../../builders/scarces/tokens.js';
import { hasLocalUpload, resolveScarceMedia } from './_media.js';

export class ScarcesTokensApi {
  constructor(
    private _http: HttpClient,
    private _storage?: StorageProvider
  ) {}

  /**
   * Mint a scarce (NFT). When a `StorageProvider` is configured and `image`
   * is a `File`/`Blob`, the bytes are uploaded locally via that provider
   * and the action is submitted directly to `/relay/execute`. Otherwise the
   * call falls through to the gateway's `/compose/mint` endpoint, which
   * uploads on the dev's behalf.
   *
   * ```ts
   * await os.scarces.tokens.mint({ title: 'My Art', image: file });
   * ```
   */
  async mint(opts: MintOptions): Promise<MintResponse> {
    if (hasLocalUpload(this._storage, opts.image)) {
      const { mediaCid, mediaHash } = await resolveScarceMedia(
        opts,
        this._storage
      );
      const action = buildQuickMintAction({
        ...opts,
        ...(mediaCid ? { mediaCid } : {}),
        ...(mediaHash ? { mediaHash } : {}),
      });
      return this._http.post<MintResponse>('/relay/execute', { action });
    }

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
    if (opts.skipAutoMedia) form.append('skipAutoMedia', 'true');
    if (opts.creator) form.append('creator', JSON.stringify(opts.creator));
    if (opts.cardBg) form.append('cardBg', opts.cardBg);
    if (opts.cardFont) form.append('cardFont', opts.cardFont);
    if (opts.cardMarkColor) form.append('cardMarkColor', opts.cardMarkColor);
    if (opts.cardMarkShape) form.append('cardMarkShape', opts.cardMarkShape);
    if (opts.cardTitleAlign) form.append('cardTitleAlign', opts.cardTitleAlign);
    if (opts.cardPhotoCid) form.append('cardPhotoCid', opts.cardPhotoCid);
    if (opts.image) form.append('image', opts.image);
    return this._http.requestForm<MintResponse>('POST', '/compose/mint', form);
  }

  /** Transfer a scarce to another account. */
  async transfer(
    tokenId: string,
    receiverId: string,
    memo?: string
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/transfer', {
      tokenId,
      receiverId,
      memo,
    });
  }

  /** Batch transfer multiple scarces in one tx. */
  async batchTransfer(
    transfers: Array<{ receiver_id: string; token_id: string; memo?: string }>
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

  /** Renew a token's expiry (collection must allow renewal). */
  async renew(
    tokenId: string,
    collectionId: string,
    newExpiresAt: number
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/renew-token', {
      tokenId,
      collectionId,
      newExpiresAt,
    });
  }

  /** Redeem a token (e.g. for goods/services off-chain). */
  async redeem(tokenId: string, collectionId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/redeem-token', {
      tokenId,
      collectionId,
    });
  }

  /** Revoke a token (creator/moderator). Mode is configured at collection level. */
  async revoke(
    tokenId: string,
    collectionId: string,
    memo?: string
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/revoke-token', {
      tokenId,
      collectionId,
      memo,
    });
  }

  /** Claim a refund for a cancelled-collection token. */
  async claimRefund(
    tokenId: string,
    collectionId: string
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/claim-refund', {
      tokenId,
      collectionId,
    });
  }
}
