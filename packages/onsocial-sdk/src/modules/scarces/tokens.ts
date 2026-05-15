// ---------------------------------------------------------------------------
// Tokens — mint, transfer, batch transfer, burn.
// ---------------------------------------------------------------------------

import { OnSocialError, type HttpClient } from '../../internal/http.js';
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

const RPC_URLS = {
  mainnet: 'https://free.rpc.fastnear.com',
  testnet: 'https://rpc.testnet.near.org',
} as const;

function encodeBase64Json(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

function decodeJsonBytes<T>(bytes: number[]): T {
  const text = new TextDecoder().decode(Uint8Array.from(bytes));
  return JSON.parse(text) as T;
}

function shouldFallbackToPublicRpc(err: unknown): boolean {
  return (
    err instanceof OnSocialError && [404, 502, 503, 504].includes(err.status)
  );
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

  private _broadcastOpts():
    | { broadcast: ReturnType<BroadcastGetter> }
    | undefined {
    const b = this._getBroadcast?.();
    return b !== undefined ? { broadcast: b } : undefined;
  }

  /** Read a native scarce token's NEP-171 metadata. */
  async get(tokenId: string): Promise<ScarceTokenView | null> {
    const params = new URLSearchParams({ tokenId });
    try {
      return await this._http.get<ScarceTokenView | null>(
        `/data/scarces-token?${params}`
      );
    } catch (err) {
      if (!shouldFallbackToPublicRpc(err)) throw err;
      return this._getViaPublicRpc(tokenId);
    }
  }

  private async _getViaPublicRpc(
    tokenId: string
  ): Promise<ScarceTokenView | null> {
    const response = await globalThis.fetch(RPC_URLS[this._http.network], {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'onsocial-sdk-scarces-token',
        method: 'query',
        params: {
          request_type: 'call_function',
          finality: 'final',
          account_id: this._scarcesContract,
          method_name: 'nft_token',
          args_base64: encodeBase64Json({ token_id: tokenId }),
        },
      }),
    });
    if (!response.ok) {
      throw new Error(
        `NEAR RPC nft_token failed: ${response.status} ${response.statusText}`
      );
    }
    const body = (await response.json()) as {
      error?: { message?: string };
      result?: { result?: number[] };
    };
    if (body.error) {
      throw new Error(
        `NEAR RPC nft_token failed: ${body.error.message ?? JSON.stringify(body.error)}`
      );
    }
    const result = body.result?.result;
    if (!Array.isArray(result)) {
      throw new Error('NEAR RPC nft_token returned no result bytes');
    }
    return decodeJsonBytes<ScarceTokenView | null>(result);
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
