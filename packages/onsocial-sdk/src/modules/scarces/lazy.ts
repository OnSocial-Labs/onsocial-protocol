// ---------------------------------------------------------------------------
// Lazy listings — mint-on-purchase. `create` accepts a configured
// StorageProvider for direct upload (mirrors `tokens.mint`).
// ---------------------------------------------------------------------------

import type { HttpClient } from '../../internal/http.js';
import type { StorageProvider } from '../../storage/provider.js';
import type {
  LazyListingOptions,
  MintResponse,
  RelayResponse,
} from '../../types.js';
import {
  composeAndSign,
  composeFormAndSign,
  signAndRelay,
  type SessionGetter,
  type BroadcastGetter,
} from '../../internal/session-bridge.js';
import { resolveContractId } from '../../internal/contracts.js';
import { buildCreateLazyListingAction } from '../../builders/scarces/lazy.js';
import { hasLocalUpload, resolveScarceMedia } from './_media.js';
import { SCARCES_VERBS } from './verbs.js';
import { scarcesRelayOptions } from './_relay.js';

export class ScarcesLazyApi {
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
   * Create a lazy listing (deferred-mint on purchase).
   *
   * ```ts
   * await os.scarces.lazy.create({
   *   title: 'Limited Print',
   *   priceNear: '5',
   *   image: file,
   * });
   * ```
   */
  async create(opts: LazyListingOptions): Promise<MintResponse> {
    if (hasLocalUpload(this._storage, opts.image, opts.mediaCid)) {
      const { mediaCid, mediaHash } = await resolveScarceMedia(
        opts,
        this._storage
      );
      const action = buildCreateLazyListingAction({
        ...opts,
        ...(mediaCid ? { mediaCid } : {}),
        ...(mediaHash ? { mediaHash } : {}),
      });
      return signAndRelay(
        this._http,
        this._getSession(),
        action as Record<string, unknown>,
        this._scarcesContract,
        'scarces.lazy.create',
        this._relayOpts()
      ) as Promise<MintResponse>;
    }

    // FormData upload route — gateway uploads media + builds the action,
    // SDK signs with the session key and relays via /relay/delegate.
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
      SCARCES_VERBS.LAZY_LIST,
      form,
      'scarces.lazy.create',
      this._relayOpts()
    );
    return {
      ...result.relay,
      ...(result.media && { media: result.media }),
      ...(result.metadata && { metadata: result.metadata }),
    } as MintResponse;
  }

  /** Purchase a lazy listing (mint-on-buy). */
  async purchase(listingId: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.PURCHASE_LAZY_LIST,
      {
        listingId,
      },
      'scarces.purchaseLazyList',
      this._relayOpts()
    );
  }

  /** Cancel a lazy listing (creator only). */
  async cancel(listingId: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.CANCEL_LAZY_LIST,
      {
        listingId,
      },
      'scarces.cancelLazyList',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Update the price of a lazy listing (creator only). */
  async updatePrice(
    listingId: string,
    newPriceNear: string
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.UPDATE_LAZY_LIST_PRICE,
      { listingId, newPriceNear },
      'scarces.updateLazyListPrice',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Update the expiry timestamp (ns) of a lazy listing (creator only). */
  async updateExpiry(
    listingId: string,
    newExpiresAt: number
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.UPDATE_LAZY_LIST_EXPIRY,
      { listingId, newExpiresAt },
      'scarces.updateLazyListExpiry',
      this._relayOpts({ confirmation: true })
    );
  }
}
