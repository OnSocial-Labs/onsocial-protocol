// ---------------------------------------------------------------------------
// Pure builders for fixed-price marketplace actions.
// ---------------------------------------------------------------------------

import type { ListingOptions } from '../../types.js';
import { nearToYocto, parseOptionalU64 } from './_shared.js';

/** Millionths of a dollar. $50 is 50000000. */
export function usdToE6(priceUsd: string): string {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(priceUsd.trim());
  if (!match) throw new Error('Invalid dollar price');
  const whole = BigInt(match[1] ?? '0');
  const frac = (match[2] ?? '').padEnd(6, '0');
  const e6 = whole * 1_000_000n + BigInt(frac);
  if (e6 <= 0n) throw new Error('Dollar price must be greater than 0');
  return e6.toString();
}

export function buildListNativeScarceAction(opts: ListingOptions) {
  const expiresAt = parseOptionalU64(opts.expiresAt);
  const expiry = expiresAt != null ? { expires_at: expiresAt } : {};
  if (opts.priceUsd) {
    const floor = opts.minNear ? nearToYocto(opts.minNear) : '1';
    return {
      type: 'list_native_scarce' as const,
      token_id: opts.tokenId,
      price: floor,
      usd_e6: usdToE6(opts.priceUsd),
      ...(opts.minNear ? { min_near: floor } : {}),
      ...expiry,
    };
  }
  if (!opts.priceNear) throw new Error('Missing priceNear');
  return {
    type: 'list_native_scarce' as const,
    token_id: opts.tokenId,
    price: nearToYocto(opts.priceNear),
    ...expiry,
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
