// ---------------------------------------------------------------------------
// Pure builders for lazy listing actions (mint-on-purchase).
// ---------------------------------------------------------------------------

import type { LazyListingOptions } from '../../types.js';
import {
  buildTokenMetadata,
  nearToYocto,
  parseOptionalU64,
} from './_shared.js';

export function buildCreateLazyListingAction(opts: LazyListingOptions) {
  return {
    type: 'create_lazy_listing' as const,
    metadata: buildTokenMetadata(opts),
    price: nearToYocto(opts.priceNear),
    ...(opts.royalty ? { royalty: opts.royalty } : {}),
    ...(opts.appId ? { app_id: opts.appId } : {}),
    ...(opts.transferable != null ? { transferable: opts.transferable } : {}),
    ...(opts.burnable != null ? { burnable: opts.burnable } : {}),
    ...(parseOptionalU64(opts.expiresAt) != null
      ? { expires_at: parseOptionalU64(opts.expiresAt) }
      : {}),
  };
}

export function buildPurchaseLazyListingAction(listingId: string) {
  return {
    type: 'purchase_lazy_listing' as const,
    listing_id: listingId,
  };
}
