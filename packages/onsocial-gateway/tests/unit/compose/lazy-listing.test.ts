/**
 * Tests for compose Lazy Listing operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mockUploadBuffer,
  mockFetch,
  mockLighthouseUpload,
  mockLighthouseText,
  mockRelaySuccess,
  mockRelayFailure,
  makeFile,
} from './helpers.js';
import {
  buildLazyListAction,
  buildCancelLazyListingAction,
  buildUpdateLazyListingPriceAction,
  buildUpdateLazyListingExpiryAction,
  buildPurchaseLazyListingAction,
  ComposeError,
} from '../../../src/services/compose/index.js';

// Stub the on-chain profile lookup so auto-card tests don't try to
// hit the NEAR RPC mock and consume mockFetch slots meant for the relay.
vi.mock('../../../src/services/compose/profileLookup.js', () => ({
  getProfileName: vi.fn(async () => ''),
  _resetProfileCache: vi.fn(),
}));

// ═══════════════════════════════════════════════════════════════════════════

describe('buildLazyListAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds action with image', async () => {
    mockLighthouseUpload('QmBuilt', 1000);
    mockLighthouseText('QmMeta', 200);

    const built = await buildLazyListAction(
      'alice.testnet',
      { title: 'Built Listing', priceNear: '5' },
      makeFile()
    );

    expect(built.action.type).toBe('create_lazy_listing');
    expect(built.action.price).toBe('5000000000000000000000000');
    expect(built.targetAccount).toBe('scarces.onsocial.testnet');
    expect(built.media!.cid).toBe('QmBuilt');
    expect(built.metadata!.cid).toBe('QmMeta');
  });

  it('builds action with mediaCid', async () => {
    mockLighthouseText('QmMeta', 200);

    const built = await buildLazyListAction(
      'alice.testnet',
      { title: 'Reused', priceNear: '3', mediaCid: 'QmReused' },
      undefined
    );

    expect(built.media!.cid).toBe('QmReused');
    expect(mockUploadBuffer).not.toHaveBeenCalled();
    const metadata = built.action.metadata as Record<string, unknown>;
    expect(metadata.media).toBe(
      'https://test-gw.lighthouseweb3.xyz/ipfs/QmReused'
    );
  });

  it('builds action without media', async () => {
    mockLighthouseText('QmMeta', 200);

    const built = await buildLazyListAction(
      'alice.testnet',
      { title: 'No Media', priceNear: '1', skipAutoMedia: true },
      undefined
    );

    expect(built.media).toBeUndefined();
    const metadata = built.action.metadata as Record<string, unknown>;
    expect(metadata.media).toBeUndefined();
  });

  it('includes extra in metadata', async () => {
    mockLighthouseText('QmM', 50);

    const built = await buildLazyListAction(
      'alice.testnet',
      {
        title: 'Extra',
        priceNear: '1',
        extra: { color: 'blue' },
        skipAutoMedia: true,
      },
      undefined
    );

    const metadata = built.action.metadata as Record<string, unknown>;
    expect(JSON.parse(metadata.extra as string)).toEqual({ color: 'blue' });
  });

  it('rejects missing price', async () => {
    await expect(
      buildLazyListAction(
        'alice.testnet',
        { title: 'No Price', priceNear: '' },
        undefined
      )
    ).rejects.toThrow('Price is required');
  });

  it('rejects invalid royalty (total > 50%)', async () => {
    await expect(
      buildLazyListAction(
        'alice.testnet',
        {
          title: 'Bad Royalty',
          priceNear: '1',
          royalty: { 'a.testnet': 3000, 'b.testnet': 3000 },
        },
        undefined
      )
    ).rejects.toThrow(/royalty/i);
  });

  it('rejects invalid royalty (too many recipients)', async () => {
    const royalty: Record<string, number> = {};
    for (let i = 0; i < 11; i++) {
      royalty[`r${i}.testnet`] = 100;
    }
    await expect(
      buildLazyListAction(
        'alice.testnet',
        { title: 'Many Royalty', priceNear: '1', royalty },
        undefined
      )
    ).rejects.toThrow(/royalty/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildCancelLazyListingAction
// ═══════════════════════════════════════════════════════════════════════════

describe('buildCancelLazyListingAction', () => {
  it('builds cancel action', () => {
    const result = buildCancelLazyListingAction('ll:alice.testnet:1');
    expect(result.action).toEqual({
      type: 'cancel_lazy_listing',
      listing_id: 'll:alice.testnet:1',
    });
    expect(result.targetAccount).toBe('scarces.onsocial.testnet');
  });

  it('uses custom targetAccount', () => {
    const result = buildCancelLazyListingAction(
      'll:alice.testnet:1',
      'custom.testnet'
    );
    expect(result.targetAccount).toBe('custom.testnet');
  });

  it('rejects missing listingId', () => {
    expect(() => buildCancelLazyListingAction('')).toThrow('Missing listingId');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildUpdateLazyListingPriceAction
// ═══════════════════════════════════════════════════════════════════════════

describe('buildUpdateLazyListingPriceAction', () => {
  it('builds update-price action', () => {
    const result = buildUpdateLazyListingPriceAction('ll:bob.testnet:1', '10');
    expect(result.action).toEqual({
      type: 'update_lazy_listing_price',
      listing_id: 'll:bob.testnet:1',
      new_price: '10000000000000000000000000',
    });
  });

  it('rejects missing listingId', () => {
    expect(() => buildUpdateLazyListingPriceAction('', '10')).toThrow(
      'Missing listingId'
    );
  });

  it('rejects missing newPriceNear', () => {
    expect(() =>
      buildUpdateLazyListingPriceAction('ll:bob.testnet:1', '')
    ).toThrow('Missing newPriceNear');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildUpdateLazyListingExpiryAction
// ═══════════════════════════════════════════════════════════════════════════

describe('buildUpdateLazyListingExpiryAction', () => {
  it('builds update-expiry action with value', () => {
    const result = buildUpdateLazyListingExpiryAction(
      'll:carol.testnet:1',
      1700000000
    );
    expect(result.action).toEqual({
      type: 'update_lazy_listing_expiry',
      listing_id: 'll:carol.testnet:1',
      new_expires_at: 1700000000,
    });
  });

  it('builds update-expiry action with null (remove expiry)', () => {
    const result = buildUpdateLazyListingExpiryAction(
      'll:carol.testnet:1',
      null
    );
    expect(result.action).toEqual({
      type: 'update_lazy_listing_expiry',
      listing_id: 'll:carol.testnet:1',
      new_expires_at: null,
    });
  });

  it('rejects missing listingId', () => {
    expect(() => buildUpdateLazyListingExpiryAction('', null)).toThrow(
      'Missing listingId'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildPurchaseLazyListingAction
// ═══════════════════════════════════════════════════════════════════════════

describe('buildPurchaseLazyListingAction', () => {
  it('builds purchase action', () => {
    const result = buildPurchaseLazyListingAction('ll:alice.testnet:1');
    expect(result.action).toEqual({
      type: 'purchase_lazy_listing',
      listing_id: 'll:alice.testnet:1',
    });
    expect(result.targetAccount).toBe('scarces.onsocial.testnet');
  });

  it('uses custom targetAccount', () => {
    const result = buildPurchaseLazyListingAction(
      'll:alice.testnet:1',
      'custom.testnet'
    );
    expect(result.targetAccount).toBe('custom.testnet');
  });

  it('rejects missing listingId', () => {
    expect(() => buildPurchaseLazyListingAction('')).toThrow(
      'Missing listingId'
    );
  });
});
