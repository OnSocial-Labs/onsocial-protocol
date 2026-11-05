// ---------------------------------------------------------------------------
// Tokens — mint, transfer, batch transfer, burn.
// ---------------------------------------------------------------------------

import type { HttpClient } from '../../internal/http.js';
import type { StorageProvider } from '../../storage/provider.js';
import type { MintOptions, MintResponse, RelayResponse } from '../../types.js';
import {
  broadcastViaWalletBatch,
  composeAndSign,
  composeFormAndSign,
  prepareCompose,
  signAndRelay,
  type SessionGetter,
  type BroadcastGetter,
} from '../../internal/session-bridge.js';
import { SCARCES_VERBS } from './verbs.js';
import { resolveContractId } from '../../internal/contracts.js';
import { buildQuickMintAction } from '../../builders/scarces/tokens.js';
import {
  hasLocalUpload,
  resolveScarceMedia,
  walletMediaUrl,
} from './_media.js';
import { scarcesRelayOptions } from './_relay.js';

export interface ScarceTokenMetadata {
  title?: string | null;
  description?: string | null;
  media?: string | null;
  media_hash?: string | null;
  copies?: number | null;
  issued_at?: number | null;
  expires_at?: number | null;
  starts_at?: number | null;
  updated_at?: number | null;
  extra?: string | null;
  reference?: string | null;
  reference_hash?: string | null;
  [key: string]: unknown;
}

export interface ScarceTokenView {
  token_id: string;
  owner_id: string;
  metadata?: ScarceTokenMetadata | null;
  approved_account_ids?: Record<string, number> | null;
}

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

  private _relayOpts(opts?: { confirmation?: boolean }) {
    return scarcesRelayOptions(this._getBroadcast, opts);
  }

  /**
   * Read one native scarce token (`nft_token`) via `GET /data/scarces-token`.
   * Returns null when that token does not exist. Does not call a public
   * chain RPC from the caller when the gateway read fails.
   */
  async get(tokenId: string): Promise<ScarceTokenView | null> {
    const params = new URLSearchParams({ tokenId });
    return this._http.get<ScarceTokenView | null>(
      `/data/scarces-token?${params}`
    );
  }

  /**
   * Mint a scarce (NFT). When a `StorageProvider` is configured and `image`
   * is a `File`/`Blob`, the bytes are uploaded locally via that provider
   * and the action is signed with the attached session and relayed via
   * `/relay/delegate`. Otherwise the call uses the gateway's
   * `/compose/prepare/mint` flow, which uploads on the dev's behalf before
   * the SDK signs and relays the prepared action.
   *
   * ```ts
   * await os.scarces.tokens.mint({ title: 'My Art', image: file });
   * ```
   */
  async mint(opts: MintOptions): Promise<MintResponse> {
    if (hasLocalUpload(this._storage, opts.image, opts.mediaCid)) {
      const { mediaCid, mediaHash } = await resolveScarceMedia(
        opts,
        this._storage
      );
      const action = buildQuickMintAction({
        ...opts,
        ...(mediaCid ? { mediaCid } : {}),
        ...(mediaCid
          ? {
              mediaUrl: walletMediaUrl(
                mediaCid,
                this._storage,
                this._http.network
              ),
            }
          : {}),
        ...(mediaHash ? { mediaHash } : {}),
      });
      return signAndRelay(
        this._http,
        this._getSession(),
        action as Record<string, unknown>,
        this._scarcesContract,
        'scarces.tokens.mint',
        this._relayOpts()
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
    if (opts.cardFormat) form.append('cardFormat', opts.cardFormat);
    if (opts.cardPalette) form.append('cardPalette', opts.cardPalette);
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
      this._relayOpts()
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
      this._relayOpts({ confirmation: true })
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
      this._relayOpts({ confirmation: true })
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
      this._relayOpts({ confirmation: true })
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
      this._relayOpts({ confirmation: true })
    );
  }

  /**
   * Renew many tokens in one or more wallet confirmations.
   * `newExpiresAt` is nanoseconds since epoch (same as `renew`).
   * Chunks stay under the NEAR prepaid gas cap (~300 TGas).
   */
  async renewMany(
    collectionId: string,
    tokenIds: string[],
    newExpiresAt: number,
    opts?: { chunkSize?: number; gasPerAction?: string }
  ): Promise<RelayResponse[]> {
    const ids = tokenIds.map((id) => id.trim()).filter(Boolean);
    if (ids.length === 0) return [];

    const broadcast = this._getBroadcast?.();
    if (typeof broadcast !== 'object' || broadcast?.kind !== 'wallet') {
      throw new Error(
        'renewMany requires wallet broadcast (batched FunctionCalls)'
      );
    }

    const chunkSize = Math.max(1, Math.min(opts?.chunkSize ?? 6, 20));
    // Keep sum under ~300 TGas prepaid (default per-action gas is 300 TGas).
    const gasPerAction = opts?.gasPerAction ?? '45000000000000';
    const results: RelayResponse[] = [];

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const calls = [];
      for (const tokenId of chunk) {
        const prepared = await prepareCompose(
          this._http,
          SCARCES_VERBS.RENEW_TOKEN,
          {
            tokenId,
            collectionId,
            newExpiresAt,
          }
        );
        const target = prepared.target_account || this._scarcesContract;
        calls.push({
          action: prepared.action as Record<string, unknown>,
          targetContract: target,
        });
      }
      const receiverId = calls[0]!.targetContract;
      for (const call of calls) {
        if (call.targetContract !== receiverId) {
          throw new Error('Renew batch must target the same contract');
        }
      }
      results.push(
        await broadcastViaWalletBatch(calls, {
          ...broadcast,
          gas: gasPerAction,
        })
      );
    }

    return results;
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
      this._relayOpts({ confirmation: true })
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
      this._relayOpts({ confirmation: true })
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
      this._relayOpts({ confirmation: true })
    );
  }
}
