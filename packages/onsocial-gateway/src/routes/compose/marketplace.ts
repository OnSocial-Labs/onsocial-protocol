/**
 * Compose routes: Secondary marketplace — list, delist, auction, purchase, bid.
 */

import { Router } from 'express';
import { actionHandlers } from './helpers.js';
import {
  buildListNativeScarceAction,
  buildDelistNativeScarceAction,
  buildDelistExternalScarceAction,
  buildUpdateSalePriceAction,
  buildListAuctionAction,
  buildSettleAuctionAction,
  buildCancelAuctionAction,
  buildPurchaseNativeScarceAction,
  buildPlaceBidAction,
} from '../../services/compose/marketplace.js';

export const marketplaceRouter = Router();

// ── List Native Scarce ──────────────────────────────────────────────────────
const list = actionHandlers(
  (b) =>
    buildListNativeScarceAction({
      tokenId: String(b.tokenId || ''),
      priceNear: String(b.priceNear || ''),
      expiresAt: b.expiresAt != null ? Number(b.expiresAt) : undefined,
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'list-native-scarce'
);
marketplaceRouter.post('/prepare/list-native-scarce', list.prepare);

// ── Delist Native Scarce ────────────────────────────────────────────────────
const delist = actionHandlers(
  (b) =>
    buildDelistNativeScarceAction({
      tokenId: String(b.tokenId || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'delist-native-scarce'
);
marketplaceRouter.post('/prepare/delist-native-scarce', delist.prepare);

// ── Delist External Scarce ──────────────────────────────────────────────────
const delistExt = actionHandlers(
  (b) =>
    buildDelistExternalScarceAction({
      scarceContractId: String(b.scarceContractId || ''),
      tokenId: String(b.tokenId || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'delist-external-scarce'
);
marketplaceRouter.post('/prepare/delist-external-scarce', delistExt.prepare);

// ── Update Sale Price ───────────────────────────────────────────────────────
const updatePrice = actionHandlers(
  (b) =>
    buildUpdateSalePriceAction({
      scarceContractId: String(b.scarceContractId || ''),
      tokenId: String(b.tokenId || ''),
      priceNear: String(b.priceNear || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'update-sale-price'
);
marketplaceRouter.post('/prepare/update-sale-price', updatePrice.prepare);

// ── List Auction ────────────────────────────────────────────────────────────
const listAuction = actionHandlers(
  (b) =>
    buildListAuctionAction({
      tokenId: String(b.tokenId || ''),
      reservePriceNear: String(b.reservePriceNear || ''),
      minBidIncrementNear: String(b.minBidIncrementNear || ''),
      expiresAt: b.expiresAt != null ? Number(b.expiresAt) : undefined,
      auctionDurationNs:
        b.auctionDurationNs != null ? Number(b.auctionDurationNs) : undefined,
      antiSnipeExtensionNs:
        b.antiSnipeExtensionNs != null
          ? Number(b.antiSnipeExtensionNs)
          : undefined,
      buyNowPriceNear: b.buyNowPriceNear
        ? String(b.buyNowPriceNear)
        : undefined,
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'list-auction'
);
marketplaceRouter.post('/prepare/list-auction', listAuction.prepare);

// ── Settle Auction ──────────────────────────────────────────────────────────
const settle = actionHandlers(
  (b) =>
    buildSettleAuctionAction({
      tokenId: String(b.tokenId || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'settle-auction'
);
marketplaceRouter.post('/prepare/settle-auction', settle.prepare);

// ── Cancel Auction ──────────────────────────────────────────────────────────
const cancelAuction = actionHandlers(
  (b) =>
    buildCancelAuctionAction({
      tokenId: String(b.tokenId || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'cancel-auction'
);
marketplaceRouter.post('/prepare/cancel-auction', cancelAuction.prepare);

// ── Purchase Native Scarce ──────────────────────────────────────────────────
const purchase = actionHandlers(
  (b) =>
    buildPurchaseNativeScarceAction({
      tokenId: String(b.tokenId || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'purchase-native-scarce'
);
marketplaceRouter.post('/prepare/purchase-native-scarce', purchase.prepare);

// ── Place Bid ───────────────────────────────────────────────────────────────
const bid = actionHandlers(
  (b) =>
    buildPlaceBidAction({
      tokenId: String(b.tokenId || ''),
      amountNear: String(b.amountNear || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'place-bid'
);
marketplaceRouter.post('/prepare/place-bid', bid.prepare);
