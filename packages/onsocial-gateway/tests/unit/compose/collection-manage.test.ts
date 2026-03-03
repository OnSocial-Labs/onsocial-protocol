/**
 * Tests for collection management builders.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import './helpers.js';
import {
  buildUpdateCollectionPriceAction,
  buildUpdateCollectionTimingAction,
  buildMintFromCollectionAction,
  buildAirdropFromCollectionAction,
  buildPurchaseFromCollectionAction,
  buildPauseCollectionAction,
  buildResumeCollectionAction,
  buildDeleteCollectionAction,
  buildCancelCollectionAction,
  buildWithdrawUnclaimedRefundsAction,
  buildSetAllowlistAction,
  buildRemoveFromAllowlistAction,
  buildSetCollectionMetadataAction,
  buildSetCollectionAppMetadataAction,
  ComposeError,
} from '../../../src/services/compose/index.js';

beforeEach(() => vi.clearAllMocks());

// ── Pricing ─────────────────────────────────────────────────────────────────
describe('buildUpdateCollectionPriceAction', () => {
  it('converts NEAR to yoctoNEAR', () => {
    const result = buildUpdateCollectionPriceAction({
      collectionId: 'art',
      newPriceNear: '5',
    });
    expect(result.action).toEqual({
      type: 'update_collection_price',
      collection_id: 'art',
      new_price_near: '5000000000000000000000000',
    });
  });

  it('throws on missing collectionId', () => {
    expect(() =>
      buildUpdateCollectionPriceAction({ collectionId: '', newPriceNear: '1' })
    ).toThrow(ComposeError);
  });
});

// ── Timing ──────────────────────────────────────────────────────────────────
describe('buildUpdateCollectionTimingAction', () => {
  it('builds timing update with nulls', () => {
    const result = buildUpdateCollectionTimingAction({
      collectionId: 'art',
    });
    expect(result.action).toEqual({
      type: 'update_collection_timing',
      collection_id: 'art',
      start_time: null,
      end_time: null,
    });
  });

  it('builds timing update with values', () => {
    const result = buildUpdateCollectionTimingAction({
      collectionId: 'art',
      startTime: 1000,
      endTime: 2000,
    });
    expect(result.action).toHaveProperty('start_time', 1000);
    expect(result.action).toHaveProperty('end_time', 2000);
  });
});

// ── Minting ─────────────────────────────────────────────────────────────────
describe('buildMintFromCollectionAction', () => {
  it('builds a mint action with defaults', () => {
    const result = buildMintFromCollectionAction({
      collectionId: 'art',
      quantity: 3,
    });
    expect(result.action).toEqual({
      type: 'mint_from_collection',
      collection_id: 'art',
      quantity: 3,
    });
  });

  it('throws on quantity > 10', () => {
    expect(() =>
      buildMintFromCollectionAction({ collectionId: 'art', quantity: 11 })
    ).toThrow(ComposeError);
  });

  it('includes receiverId when provided', () => {
    const result = buildMintFromCollectionAction({
      collectionId: 'art',
      quantity: 1,
      receiverId: 'alice.near',
    });
    expect(result.action).toHaveProperty('receiver_id', 'alice.near');
  });
});

// ── Airdrop ─────────────────────────────────────────────────────────────────
describe('buildAirdropFromCollectionAction', () => {
  it('builds a valid airdrop action', () => {
    const result = buildAirdropFromCollectionAction({
      collectionId: 'art',
      receivers: ['a.near', 'b.near'],
    });
    expect(result.action).toEqual({
      type: 'airdrop_from_collection',
      collection_id: 'art',
      receivers: ['a.near', 'b.near'],
    });
  });

  it('throws on empty receivers', () => {
    expect(() =>
      buildAirdropFromCollectionAction({ collectionId: 'art', receivers: [] })
    ).toThrow(ComposeError);
  });
});

// ── Purchase from Collection ────────────────────────────────────────────────
describe('buildPurchaseFromCollectionAction', () => {
  it('builds a purchase action with yoctoNEAR price', () => {
    const result = buildPurchaseFromCollectionAction({
      collectionId: 'art',
      quantity: 2,
      maxPricePerTokenNear: '1',
    });
    expect(result.action).toEqual({
      type: 'purchase_from_collection',
      collection_id: 'art',
      quantity: 2,
      max_price_per_token: '1000000000000000000000000',
    });
  });

  it('throws on missing maxPricePerTokenNear', () => {
    expect(() =>
      buildPurchaseFromCollectionAction({
        collectionId: 'art',
        quantity: 1,
        maxPricePerTokenNear: '',
      })
    ).toThrow(ComposeError);
  });
});

// ── Lifecycle ───────────────────────────────────────────────────────────────
describe('buildPauseCollectionAction', () => {
  it('builds a valid pause action', () => {
    const result = buildPauseCollectionAction({ collectionId: 'art' });
    expect(result.action).toEqual({
      type: 'pause_collection',
      collection_id: 'art',
    });
  });
});

describe('buildResumeCollectionAction', () => {
  it('builds a valid resume action', () => {
    const result = buildResumeCollectionAction({ collectionId: 'art' });
    expect(result.action).toEqual({
      type: 'resume_collection',
      collection_id: 'art',
    });
  });
});

describe('buildDeleteCollectionAction', () => {
  it('builds a valid delete action', () => {
    const result = buildDeleteCollectionAction({ collectionId: 'art' });
    expect(result.action).toEqual({
      type: 'delete_collection',
      collection_id: 'art',
    });
  });
});

describe('buildCancelCollectionAction', () => {
  it('builds a cancel action with refund info', () => {
    const result = buildCancelCollectionAction({
      collectionId: 'art',
      refundPerTokenNear: '2',
    });
    expect(result.action).toEqual({
      type: 'cancel_collection',
      collection_id: 'art',
      refund_per_token: '2000000000000000000000000',
    });
  });

  it('includes refundDeadlineNs when provided', () => {
    const result = buildCancelCollectionAction({
      collectionId: 'art',
      refundPerTokenNear: '2',
      refundDeadlineNs: 1700000000000000000,
    });
    expect(result.action).toHaveProperty(
      'refund_deadline_ns',
      1700000000000000000
    );
  });

  it('throws on missing refundPerTokenNear', () => {
    expect(() =>
      buildCancelCollectionAction({
        collectionId: 'art',
        refundPerTokenNear: '',
      })
    ).toThrow(ComposeError);
  });
});

describe('buildWithdrawUnclaimedRefundsAction', () => {
  it('builds a valid withdraw action', () => {
    const result = buildWithdrawUnclaimedRefundsAction({
      collectionId: 'art',
    });
    expect(result.action).toEqual({
      type: 'withdraw_unclaimed_refunds',
      collection_id: 'art',
    });
  });
});

// ── Allowlist ───────────────────────────────────────────────────────────────
describe('buildSetAllowlistAction', () => {
  it('builds a valid set-allowlist action', () => {
    const result = buildSetAllowlistAction({
      collectionId: 'art',
      entries: [{ account_id: 'alice.near', allocation: 3 }],
    });
    expect(result.action).toEqual({
      type: 'set_allowlist',
      collection_id: 'art',
      entries: [{ account_id: 'alice.near', allocation: 3 }],
    });
  });

  it('throws on empty entries', () => {
    expect(() =>
      buildSetAllowlistAction({ collectionId: 'art', entries: [] })
    ).toThrow(ComposeError);
  });
});

describe('buildRemoveFromAllowlistAction', () => {
  it('builds a valid remove-from-allowlist action', () => {
    const result = buildRemoveFromAllowlistAction({
      collectionId: 'art',
      accounts: ['alice.near'],
    });
    expect(result.action).toEqual({
      type: 'remove_from_allowlist',
      collection_id: 'art',
      accounts: ['alice.near'],
    });
  });

  it('throws on empty accounts', () => {
    expect(() =>
      buildRemoveFromAllowlistAction({ collectionId: 'art', accounts: [] })
    ).toThrow(ComposeError);
  });
});

// ── Metadata ────────────────────────────────────────────────────────────────
describe('buildSetCollectionMetadataAction', () => {
  it('builds action with metadata', () => {
    const result = buildSetCollectionMetadataAction({
      collectionId: 'art',
      metadata: '{"theme":"dark"}',
    });
    expect(result.action).toEqual({
      type: 'set_collection_metadata',
      collection_id: 'art',
      metadata: '{"theme":"dark"}',
    });
  });

  it('builds action with null metadata (clear)', () => {
    const result = buildSetCollectionMetadataAction({
      collectionId: 'art',
      metadata: null,
    });
    expect(result.action).toHaveProperty('metadata', null);
  });
});

describe('buildSetCollectionAppMetadataAction', () => {
  it('builds action with app-scoped metadata', () => {
    const result = buildSetCollectionAppMetadataAction({
      appId: 'tickets.near',
      collectionId: 'concert',
      metadata: '{"venue":"arena"}',
    });
    expect(result.action).toEqual({
      type: 'set_collection_app_metadata',
      app_id: 'tickets.near',
      collection_id: 'concert',
      metadata: '{"venue":"arena"}',
    });
  });

  it('throws on missing appId', () => {
    expect(() =>
      buildSetCollectionAppMetadataAction({
        appId: '',
        collectionId: 'concert',
        metadata: null,
      })
    ).toThrow(ComposeError);
  });
});
