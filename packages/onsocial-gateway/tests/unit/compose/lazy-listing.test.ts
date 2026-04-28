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
  composeLazyList,
  buildLazyListAction,
  buildCancelLazyListingAction,
  buildUpdateLazyListingPriceAction,
  buildUpdateLazyListingExpiryAction,
  buildPurchaseLazyListingAction,
  ComposeError,
} from '../../../src/services/compose/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// composeLazyList
// ═══════════════════════════════════════════════════════════════════════════

describe('composeLazyList', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a lazy listing with image upload', async () => {
    mockLighthouseUpload('QmArtCid', 50000);
    mockLighthouseText('QmMetaCid', 300);
    mockRelaySuccess('tx_lazy');

    const result = await composeLazyList(
      'alice.testnet',
      { title: 'Sunset Art', priceNear: '5', description: 'A sunset' },
      makeFile()
    );

    expect(result.txHash).toBe('tx_lazy');
    expect(result.media!.cid).toBe('QmArtCid');
    expect(result.metadata!.cid).toBe('QmMetaCid');

    // Verify action shape
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action.type).toBe('create_lazy_listing');
    expect(body.action.metadata.title).toBe('Sunset Art');
    expect(body.action.metadata.description).toBe('A sunset');
    expect(body.action.metadata.media).toBe(
      'https://test-gw.lighthouseweb3.xyz/ipfs/QmArtCid'
    );
    expect(body.action.metadata.reference).toBe(
      'https://test-gw.lighthouseweb3.xyz/ipfs/QmMetaCid'
    );
    expect(body.action.price).toBe('5000000000000000000000000');
    // ScarceOptions flattened — no nested options object
    expect(body.action.options).toBeUndefined();
  });

  it('creates a lazy listing with mediaCid reuse (no upload)', async () => {
    mockLighthouseText('QmMetaCid', 300);
    mockRelaySuccess('tx_reuse');

    const result = await composeLazyList(
      'bob.testnet',
      {
        title: 'Reused Media',
        priceNear: '2',
        mediaCid: 'QmExistingCid',
        mediaHash: 'abc123hash',
      },
      undefined
    );

    expect(result.txHash).toBe('tx_reuse');
    expect(result.media!.cid).toBe('QmExistingCid');
    expect(result.media!.hash).toBe('abc123hash');
    // Should NOT upload image buffer
    expect(mockUploadBuffer).not.toHaveBeenCalled();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action.metadata.media).toBe(
      'https://test-gw.lighthouseweb3.xyz/ipfs/QmExistingCid'
    );
    expect(body.action.metadata.media_hash).toBe('abc123hash');
  });

  it('creates a lazy listing without any media', async () => {
    mockLighthouseText('QmMetaOnly', 100);
    mockRelaySuccess('tx_nomedia');

    const result = await composeLazyList(
      'carol.testnet',
      { title: 'Text Listing', priceNear: '1' },
      undefined
    );

    expect(result.txHash).toBe('tx_nomedia');
    expect(result.media).toBeUndefined();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action.metadata.media).toBeUndefined();
    expect(body.action.metadata.reference).toBe(
      'https://test-gw.lighthouseweb3.xyz/ipfs/QmMetaOnly'
    );
  });

  it('includes royalty (flattened)', async () => {
    mockLighthouseText('QmM', 50);
    mockRelaySuccess();

    await composeLazyList(
      'alice.testnet',
      {
        title: 'Royalty Listing',
        priceNear: '10',
        royalty: { 'artist.testnet': 2500 },
      },
      undefined
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action.royalty).toEqual({ 'artist.testnet': 2500 });
  });

  it('includes ScarceOptions fields (flattened)', async () => {
    mockLighthouseText('QmM', 50);
    mockRelaySuccess();

    await composeLazyList(
      'alice.testnet',
      {
        title: 'Full Options',
        priceNear: '3',
        appId: 'my-app',
        transferable: false,
        burnable: false,
        expiresAt: 1700000000,
      },
      undefined
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.action.app_id).toBe('my-app');
    expect(body.action.transferable).toBe(false);
    expect(body.action.burnable).toBe(false);
    expect(body.action.expires_at).toBe(1700000000);
  });

  it('relays to correct target account (testnet default)', async () => {
    mockLighthouseText('QmM', 50);
    mockRelaySuccess();

    await composeLazyList(
      'alice.testnet',
      { title: 'Target Test', priceNear: '1' },
      undefined
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.target_account).toBe('scarces.onsocial.testnet');
  });

  it('uses custom target account when specified', async () => {
    mockLighthouseText('QmM', 50);
    mockRelaySuccess();

    await composeLazyList(
      'alice.testnet',
      {
        title: 'Custom Target',
        priceNear: '1',
        targetAccount: 'custom.testnet',
      },
      undefined
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.target_account).toBe('custom.testnet');
  });

  it('throws ComposeError when relay fails', async () => {
    mockLighthouseText('QmM', 50);
    mockRelayFailure(500, 'Contract panic');

    await expect(
      composeLazyList(
        'alice.testnet',
        { title: 'Fail', priceNear: '1' },
        undefined
      )
    ).rejects.toThrow(ComposeError);
  });

  it('throws ComposeError when price is missing', async () => {
    await expect(
      composeLazyList(
        'alice.testnet',
        { title: 'No Price', priceNear: '' },
        undefined
      )
    ).rejects.toThrow(ComposeError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildLazyListAction
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
      { title: 'No Media', priceNear: '1' },
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
      { title: 'Extra', priceNear: '1', extra: { color: 'blue' } },
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
