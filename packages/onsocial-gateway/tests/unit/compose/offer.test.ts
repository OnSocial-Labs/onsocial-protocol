/**
 * Tests for offer builders — token-level and collection-level offers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import './helpers.js';
import {
  buildMakeOfferAction,
  buildCancelOfferAction,
  buildAcceptOfferAction,
  buildMakeCollectionOfferAction,
  buildCancelCollectionOfferAction,
  buildAcceptCollectionOfferAction,
  ComposeError,
} from '../../../src/services/compose/index.js';

beforeEach(() => vi.clearAllMocks());

// ── Token Offers ────────────────────────────────────────────────────────────
describe('buildMakeOfferAction', () => {
  it('builds a valid offer with yoctoNEAR amount', () => {
    const result = buildMakeOfferAction({
      tokenId: 's:1',
      amountNear: '3',
    });
    expect(result.action).toEqual({
      type: 'make_offer',
      token_id: 's:1',
      amount: '3000000000000000000000000',
    });
  });

  it('includes optional expiresAt', () => {
    const result = buildMakeOfferAction({
      tokenId: 's:1',
      amountNear: '3',
      expiresAt: 1700000000,
    });
    expect(result.action).toHaveProperty('expires_at', 1700000000);
  });

  it('throws on missing tokenId', () => {
    expect(() =>
      buildMakeOfferAction({ tokenId: '', amountNear: '3' })
    ).toThrow(ComposeError);
  });

  it('throws on missing amountNear', () => {
    expect(() =>
      buildMakeOfferAction({ tokenId: 's:1', amountNear: '' })
    ).toThrow(ComposeError);
  });
});

describe('buildCancelOfferAction', () => {
  it('builds a valid cancel offer action', () => {
    const result = buildCancelOfferAction({ tokenId: 's:1' });
    expect(result.action).toEqual({
      type: 'cancel_offer',
      token_id: 's:1',
    });
  });
});

describe('buildAcceptOfferAction', () => {
  it('builds a valid accept offer action', () => {
    const result = buildAcceptOfferAction({
      tokenId: 's:1',
      buyerId: 'buyer.near',
    });
    expect(result.action).toEqual({
      type: 'accept_offer',
      token_id: 's:1',
      buyer_id: 'buyer.near',
    });
  });

  it('throws on missing buyerId', () => {
    expect(() =>
      buildAcceptOfferAction({ tokenId: 's:1', buyerId: '' })
    ).toThrow(ComposeError);
  });
});

// ── Collection Offers ───────────────────────────────────────────────────────
describe('buildMakeCollectionOfferAction', () => {
  it('builds a valid collection offer', () => {
    const result = buildMakeCollectionOfferAction({
      collectionId: 'art',
      amountNear: '5',
    });
    expect(result.action).toEqual({
      type: 'make_collection_offer',
      collection_id: 'art',
      amount: '5000000000000000000000000',
    });
  });

  it('includes optional expiresAt', () => {
    const result = buildMakeCollectionOfferAction({
      collectionId: 'art',
      amountNear: '5',
      expiresAt: 1700000000,
    });
    expect(result.action).toHaveProperty('expires_at', 1700000000);
  });

  it('throws on missing collectionId', () => {
    expect(() =>
      buildMakeCollectionOfferAction({ collectionId: '', amountNear: '5' })
    ).toThrow(ComposeError);
  });
});

describe('buildCancelCollectionOfferAction', () => {
  it('builds a valid cancel collection offer', () => {
    const result = buildCancelCollectionOfferAction({ collectionId: 'art' });
    expect(result.action).toEqual({
      type: 'cancel_collection_offer',
      collection_id: 'art',
    });
  });
});

describe('buildAcceptCollectionOfferAction', () => {
  it('builds a valid accept collection offer', () => {
    const result = buildAcceptCollectionOfferAction({
      collectionId: 'art',
      tokenId: 'art:5',
      buyerId: 'buyer.near',
    });
    expect(result.action).toEqual({
      type: 'accept_collection_offer',
      collection_id: 'art',
      token_id: 'art:5',
      buyer_id: 'buyer.near',
    });
  });

  it('throws on missing tokenId', () => {
    expect(() =>
      buildAcceptCollectionOfferAction({
        collectionId: 'art',
        tokenId: '',
        buyerId: 'buyer.near',
      })
    ).toThrow(ComposeError);
  });

  it('throws on missing buyerId', () => {
    expect(() =>
      buildAcceptCollectionOfferAction({
        collectionId: 'art',
        tokenId: 'art:5',
        buyerId: '',
      })
    ).toThrow(ComposeError);
  });
});
