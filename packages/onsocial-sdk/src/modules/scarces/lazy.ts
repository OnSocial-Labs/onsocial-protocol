// ---------------------------------------------------------------------------
// Lazy listings — mint-on-purchase. `create` accepts a configured
// StorageProvider for direct upload (mirrors `tokens.mint`).
// ---------------------------------------------------------------------------

import type { HttpClient } from '../../http.js';
import type { StorageProvider } from '../../storage/provider.js';
import type {
  LazyListingOptions,
  MintResponse,
  RelayResponse,
} from '../../types.js';
import { buildCreateLazyListingAction } from '../../builders/scarces/lazy.js';
import { hasLocalUpload, resolveScarceMedia } from './_media.js';

export class ScarcesLazyApi {
  constructor(
    private _http: HttpClient,
    private _storage?: StorageProvider
  ) {}

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
    if (hasLocalUpload(this._storage, opts.image)) {
      const { mediaCid, mediaHash } = await resolveScarceMedia(
        opts,
        this._storage
      );
      const action = buildCreateLazyListingAction({
        ...opts,
        ...(mediaCid ? { mediaCid } : {}),
        ...(mediaHash ? { mediaHash } : {}),
      });
      return this._http.post<MintResponse>('/relay/execute', { action });
    }

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
    return this._http.requestForm<MintResponse>(
      'POST',
      '/compose/lazy-list',
      form
    );
  }

  /** Purchase a lazy listing (mint-on-buy). */
  async purchase(listingId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/purchase-lazy-listing', {
      listingId,
    });
  }

  /** Cancel a lazy listing (creator only). */
  async cancel(listingId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/cancel-lazy-list', {
      listingId,
    });
  }
}
