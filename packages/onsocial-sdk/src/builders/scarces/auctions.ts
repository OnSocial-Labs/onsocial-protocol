// ---------------------------------------------------------------------------
// Pure builders for auction actions.
// ---------------------------------------------------------------------------

import type { AuctionOptions } from '../../types.js';
import { nearToYocto, parseOptionalU64 } from './_shared.js';

export function buildListAuctionAction(opts: AuctionOptions) {
  return {
    type: 'list_auction' as const,
    token_id: opts.tokenId,
    reserve_price: nearToYocto(opts.reservePriceNear),
    min_bid_increment: nearToYocto(opts.minBidIncrementNear),
    ...(opts.buyNowPriceNear
      ? { buy_now_price: nearToYocto(opts.buyNowPriceNear) }
      : {}),
    ...(parseOptionalU64(opts.expiresAt) != null
      ? { expires_at: parseOptionalU64(opts.expiresAt) }
      : {}),
  };
}

export function buildPlaceBidAction(tokenId: string, amountNear: string) {
  return {
    type: 'place_bid' as const,
    token_id: tokenId,
    amount: nearToYocto(amountNear),
  };
}

export function buildSettleAuctionAction(tokenId: string) {
  return {
    type: 'settle_auction' as const,
    token_id: tokenId,
  };
}

export function buildCancelAuctionAction(tokenId: string) {
  return {
    type: 'cancel_auction' as const,
    token_id: tokenId,
  };
}
