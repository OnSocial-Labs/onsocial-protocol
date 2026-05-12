// ---------------------------------------------------------------------------
// Tokens — mint, transfer, batch transfer, burn.
// ---------------------------------------------------------------------------

import type { HttpClient } from '../../internal/http.js';
import type { StorageProvider } from '../../storage/provider.js';
import type { MintOptions, MintResponse, RelayResponse } from '../../types.js';
import {
  composeAndSign,
  composeFormAndSign,
  signAndRelay,
  type SessionGetter,
  type BroadcastGetter,
} from '../../internal/session-bridge.js';
import { SCARCES_VERBS } from './verbs.js';
import { resolveContractId } from '../../internal/contracts.js';
import { buildQuickMintAction } from '../../builders/scarces/tokens.js';
import { hasLocalUpload, resolveScarceMedia } from './_media.js';

export class ScarcesTokensApi {
  private _scarcesContract: string;

  constructor(
    private _http: HttpClient,
    private _getSession: SessionGetter,
    private _storage?: StorageProvider,
    private _getBroadcast?: BroadcastGetter
  ) {
    this._scarcesContract = resolveContractId(_http.network, 'scarces');
  }

  private _broadcastOpts():
    | { broadcast: ReturnType<BroadcastGetter> }
    | undefined {
    const b = this._getBroadcast?.();
    return b !== undefined ? { broadcast: b } : undefined;
  }

  /**
   * Mint a scarce (NFT). When a `StorageProvider` is configured and `image`
   * is a `File`/`Blob`, the bytes are uploaded locally via that provider
   * and the action is signed with the attached session and relayed via
   * `/relay/delegate`. Otherwise the call falls through to the gateway's
   * `/compose/mint` endpoint, which uploads on the dev's behalf.
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
      const broadcast = this._getBroadcast?.();
      return signAndRelay(
        this._http,
        this._getSession(),
        action as Record<string, unknown>,
        this._scarcesContract,
        'scarces.tokens.mint',
        broadcast !== undefined ? { broadcast } : undefined
      ) as Promise<MintResponse>;
    }

    // FormData upload route — gateway uploads media + builds the action,
    // SDK signs with the session key and relays via /relay/delegate.
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

    const result = await composeFormAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.MINT,
      form,
      'scarces.tokens.mint',
      this._broadcastOpts()
    );
    return {
      ...result.relay,
      ...(result.media && { media: result.media }),
      ...(result.metadata && { metadata: result.metadata }),
    } as MintResponse;
  }

  /** Transfer a scarce to another account. */
  async transfer(
    tokenId: string,
    receiverId: string,
    memo?: string
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.TRANSFER,
      {
        tokenId,
        receiverId,
        memo,
      },
      'scarces.transfer',
      this._broadcastOpts()
    );
  }

  /** Batch transfer multiple scarces in one tx. */
  async batchTransfer(
    transfers: Array<{ receiver_id: string; token_id: string; memo?: string }>
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.BATCH_TRANSFER,
      {
        transfers,
      },
      'scarces.batchTransfer',
      this._broadcastOpts()
    );
  }

  /** Burn a scarce. */
  async burn(tokenId: string, collectionId?: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.BURN,
      {
        tokenId,
        collectionId,
      },
      'scarces.burn',
      this._broadcastOpts()
    );
  }

  /** Renew a token's expiry (collection must allow renewal). */
  async renew(
    tokenId: string,
    collectionId: string,
    newExpiresAt: number
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.RENEW_TOKEN,
      {
        tokenId,
        collectionId,
        newExpiresAt,
      },
      'scarces.renewToken',
      this._broadcastOpts()
    );
  }

  /** Redeem a token (e.g. for goods/services off-chain). */
  async redeem(tokenId: string, collectionId: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.REDEEM_TOKEN,
      {
        tokenId,
        collectionId,
      },
      'scarces.redeemToken',
      this._broadcastOpts()
    );
  }

  /** Revoke a token (creator/moderator). Mode is configured at collection level. */
  async revoke(
    tokenId: string,
    collectionId: string,
    memo?: string
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.REVOKE_TOKEN,
      {
        tokenId,
        collectionId,
        memo,
      },
      'scarces.revokeToken',
      this._broadcastOpts()
    );
  }

  /** Claim a refund for a cancelled-collection token. */
  async claimRefund(
    tokenId: string,
    collectionId: string
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.CLAIM_REFUND,
      {
        tokenId,
        collectionId,
      },
      'scarces.claimRefund',
      this._broadcastOpts()
    );
  }
}
