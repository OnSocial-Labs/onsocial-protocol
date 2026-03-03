/**
 * Tests for secondary marketplace builders.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import './helpers.js';
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
  ComposeError,
} from '../../../src/services/compose/index.js';

beforeEach(() => vi.clearAllMocks());

// ── List ────────────────────────────────────────────────────────────────────
describe('buildListNativeScarceAction', () => {
  it('builds a valid list action with yoctoNEAR price', () => {
    const result = buildListNativeScarceAction({
      tokenId: 's:1',
      priceNear: '10',
    });
    expect(result.action).toEqual({
      type: 'list_native_scarce',
      token_id: 's:1',
      price: '10000000000000000000000000',
    });
    expect(result.targetAccount).toBe('scarces.onsocial.testnet');
  });

  it('includes optional expiresAt', () => {
    const result = buildListNativeScarceAction({
      tokenId: 's:1',
      priceNear: '10',
      expiresAt: 1700000000,
    });
    expect(result.action).toHaveProperty('expires_at', 1700000000);
  });

  it('throws on missing tokenId', () => {
    expect(() =>
      buildListNativeScarceAction({ tokenId: '', priceNear: '10' })
    ).toThrow(ComposeError);
  });

  it('throws on missing priceNear', () => {
    expect(() =>
      buildListNativeScarceAction({ tokenId: 's:1', priceNear: '' })
    ).toThrow(ComposeError);
  });
});

// ── Delist ───────────────────────────────────────────────────────────────────
describe('buildDelistNativeScarceAction', () => {
  it('builds a valid delist action', () => {
    const result = buildDelistNativeScarceAction({ tokenId: 's:1' });
    expect(result.action).toEqual({
      type: 'delist_native_scarce',
      token_id: 's:1',
    });
  });
});

describe('buildDelistExternalScarceAction', () => {
  it('builds a valid external delist action', () => {
    const result = buildDelistExternalScarceAction({
      scarceContractId: 'nft.example.near',
      tokenId: '42',
    });
    expect(result.action).toEqual({
      type: 'delist_scarce',
      scarce_contract_id: 'nft.example.near',
      token_id: '42',
    });
  });

  it('throws on missing scarceContractId', () => {
    expect(() =>
      buildDelistExternalScarceAction({
        scarceContractId: '',
        tokenId: '42',
      })
    ).toThrow(ComposeError);
  });
});

// ── Update Price ────────────────────────────────────────────────────────────
describe('buildUpdateSalePriceAction', () => {
  it('builds a valid update-price action', () => {
    const result = buildUpdateSalePriceAction({
      scarceContractId: 'nft.near',
      tokenId: '42',
      priceNear: '5',
    });
    expect(result.action).toEqual({
      type: 'update_price',
      scarce_contract_id: 'nft.near',
      token_id: '42',
      price: '5000000000000000000000000',
    });
  });
});

// ── Auction ─────────────────────────────────────────────────────────────────
describe('buildListAuctionAction', () => {
  it('builds a valid auction listing', () => {
    const result = buildListAuctionAction({
      tokenId: 's:1',
      reservePriceNear: '5',
      minBidIncrementNear: '0.5',
    });
    expect(result.action).toEqual({
      type: 'list_native_scarce_auction',
      token_id: 's:1',
      reserve_price: '5000000000000000000000000',
      min_bid_increment: '500000000000000000000000',
    });
  });

  it('includes optional auction params', () => {
    const result = buildListAuctionAction({
      tokenId: 's:1',
      reservePriceNear: '5',
      minBidIncrementNear: '0.5',
      expiresAt: 1700000000,
      buyNowPriceNear: '20',
      antiSnipeExtensionNs: 300000000000,
    });
    expect(result.action).toHaveProperty('expires_at', 1700000000);
    expect(result.action).toHaveProperty(
      'buy_now_price',
      '20000000000000000000000000'
    );
    expect(result.action).toHaveProperty(
      'anti_snipe_extension_ns',
      300000000000
    );
  });

  it('throws on missing reservePriceNear', () => {
    expect(() =>
      buildListAuctionAction({
        tokenId: 's:1',
        reservePriceNear: '',
        minBidIncrementNear: '0.5',
      })
    ).toThrow(ComposeError);
  });
});

describe('buildSettleAuctionAction', () => {
  it('builds a valid settle action', () => {
    const result = buildSettleAuctionAction({ tokenId: 's:1' });
    expect(result.action).toEqual({
      type: 'settle_auction',
      token_id: 's:1',
    });
  });
});

describe('buildCancelAuctionAction', () => {
  it('builds a valid cancel auction action', () => {
    const result = buildCancelAuctionAction({ tokenId: 's:1' });
    expect(result.action).toEqual({
      type: 'cancel_auction',
      token_id: 's:1',
    });
  });
});

// ── Buyer Actions ───────────────────────────────────────────────────────────
describe('buildPurchaseNativeScarceAction', () => {
  it('builds a valid purchase action', () => {
    const result = buildPurchaseNativeScarceAction({ tokenId: 's:1' });
    expect(result.action).toEqual({
      type: 'purchase_native_scarce',
      token_id: 's:1',
    });
  });
});

describe('buildPlaceBidAction', () => {
  it('builds a valid bid with yoctoNEAR amount', () => {
    const result = buildPlaceBidAction({
      tokenId: 's:1',
      amountNear: '7.5',
    });
    expect(result.action).toEqual({
      type: 'place_bid',
      token_id: 's:1',
      amount: '7500000000000000000000000',
    });
  });

  it('throws on missing amountNear', () => {
    expect(() =>
      buildPlaceBidAction({ tokenId: 's:1', amountNear: '' })
    ).toThrow(ComposeError);
  });
});
