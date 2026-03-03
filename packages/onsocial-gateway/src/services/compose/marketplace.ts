/**
 * Compose: Secondary marketplace — list, delist, auctions, purchases, bids.
 *
 * Covers fixed-price listings, auction listings, and buyer-side actions.
 * All payments are handled gaslessly via NEAR Intents / wNEAR through the relayer.
 */

import {
  type SimpleActionResult,
  ComposeError,
  resolveScarcesTarget,
  nearToYocto,
} from './shared.js';

// ---------------------------------------------------------------------------
// Fixed-price listing
// ---------------------------------------------------------------------------

/** Build a ListNativeScarce action — list a native token for fixed-price sale. */
export function buildListNativeScarceAction(params: {
  tokenId: string;
  priceNear: string;
  expiresAt?: number;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.tokenId) throw new ComposeError(400, 'Missing tokenId');
  if (!params.priceNear) throw new ComposeError(400, 'Missing priceNear');
  return {
    action: {
      type: 'list_native_scarce',
      token_id: params.tokenId,
      price: nearToYocto(params.priceNear),
      ...(params.expiresAt != null && { expires_at: params.expiresAt }),
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build a DelistNativeScarce action — remove a native token listing. */
export function buildDelistNativeScarceAction(params: {
  tokenId: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.tokenId) throw new ComposeError(400, 'Missing tokenId');
  return {
    action: { type: 'delist_native_scarce', token_id: params.tokenId },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build a DelistScarce action — remove an external token listing. */
export function buildDelistExternalScarceAction(params: {
  scarceContractId: string;
  tokenId: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.scarceContractId)
    throw new ComposeError(400, 'Missing scarceContractId');
  if (!params.tokenId) throw new ComposeError(400, 'Missing tokenId');
  return {
    action: {
      type: 'delist_scarce',
      scarce_contract_id: params.scarceContractId,
      token_id: params.tokenId,
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build an UpdatePrice action — update price of an external listing. */
export function buildUpdateSalePriceAction(params: {
  scarceContractId: string;
  tokenId: string;
  priceNear: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.scarceContractId)
    throw new ComposeError(400, 'Missing scarceContractId');
  if (!params.tokenId) throw new ComposeError(400, 'Missing tokenId');
  if (!params.priceNear) throw new ComposeError(400, 'Missing priceNear');
  return {
    action: {
      type: 'update_price',
      scarce_contract_id: params.scarceContractId,
      token_id: params.tokenId,
      price: nearToYocto(params.priceNear),
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

// ---------------------------------------------------------------------------
// Auctions
// ---------------------------------------------------------------------------

/** Build a ListNativeScarceAuction action — list a native token for auction. */
export function buildListAuctionAction(params: {
  tokenId: string;
  reservePriceNear: string;
  minBidIncrementNear: string;
  expiresAt?: number;
  auctionDurationNs?: number;
  antiSnipeExtensionNs?: number;
  buyNowPriceNear?: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.tokenId) throw new ComposeError(400, 'Missing tokenId');
  if (!params.reservePriceNear)
    throw new ComposeError(400, 'Missing reservePriceNear');
  if (!params.minBidIncrementNear)
    throw new ComposeError(400, 'Missing minBidIncrementNear');
  return {
    action: {
      type: 'list_native_scarce_auction',
      token_id: params.tokenId,
      // AuctionListing is #[serde(flatten)] — fields are at root level
      reserve_price: nearToYocto(params.reservePriceNear),
      min_bid_increment: nearToYocto(params.minBidIncrementNear),
      ...(params.expiresAt != null && { expires_at: params.expiresAt }),
      ...(params.auctionDurationNs != null && {
        auction_duration_ns: params.auctionDurationNs,
      }),
      ...(params.antiSnipeExtensionNs != null && {
        anti_snipe_extension_ns: params.antiSnipeExtensionNs,
      }),
      ...(params.buyNowPriceNear && {
        buy_now_price: nearToYocto(params.buyNowPriceNear),
      }),
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build a SettleAuction action — finalize a completed auction. */
export function buildSettleAuctionAction(params: {
  tokenId: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.tokenId) throw new ComposeError(400, 'Missing tokenId');
  return {
    action: { type: 'settle_auction', token_id: params.tokenId },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build a CancelAuction action — cancel an active auction. */
export function buildCancelAuctionAction(params: {
  tokenId: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.tokenId) throw new ComposeError(400, 'Missing tokenId');
  return {
    action: { type: 'cancel_auction', token_id: params.tokenId },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

// ---------------------------------------------------------------------------
// Buyer actions
// ---------------------------------------------------------------------------

/** Build a PurchaseNativeScarce action — buy a listed native token. */
export function buildPurchaseNativeScarceAction(params: {
  tokenId: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.tokenId) throw new ComposeError(400, 'Missing tokenId');
  return {
    action: { type: 'purchase_native_scarce', token_id: params.tokenId },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build a PlaceBid action — place a bid on an auction. */
export function buildPlaceBidAction(params: {
  tokenId: string;
  amountNear: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.tokenId) throw new ComposeError(400, 'Missing tokenId');
  if (!params.amountNear) throw new ComposeError(400, 'Missing amountNear');
  return {
    action: {
      type: 'place_bid',
      token_id: params.tokenId,
      amount: nearToYocto(params.amountNear),
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}
