// ---------------------------------------------------------------------------
// Pure builders for fixed-price marketplace actions.
// ---------------------------------------------------------------------------

import type { ListingOptions } from '../../types.js';
import { nearToYocto, parseOptionalU64 } from './_shared.js';

export function buildListNativeScarceAction(opts: ListingOptions) {
  return {
    type: 'list_native_scarce' as const,
    token_id: opts.tokenId,
    price: nearToYocto(opts.priceNear),
    ...(parseOptionalU64(opts.expiresAt) != null
      ? { expires_at: parseOptionalU64(opts.expiresAt) }
      : {}),
  };
}

export function buildDelistNativeScarceAction(tokenId: string) {
  return {
    type: 'delist_native_scarce' as const,
    token_id: tokenId,
  };
}

export function buildPurchaseNativeScarceAction(tokenId: string) {
  return {
    type: 'purchase_native_scarce' as const,
    token_id: tokenId,
  };
}
