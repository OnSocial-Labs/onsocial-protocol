import { describe, expect, it, beforeEach } from 'vitest';
import type { PostScarceEmbed } from '@onsocial/sdk';
import {
  clearScarceEmbedOverride,
  getScarceEmbedOverride,
  reconcileScarceEmbedFromApi,
  resolveScarceEmbed,
  setScarceEmbedOverride,
} from '@/features/scarces/scarce-embed-ledger';

const KEY = 'alice.near/post/1';

function embed(over: Partial<PostScarceEmbed>): PostScarceEmbed {
  return {
    status: 'none',
    events: [],
    ...over,
  };
}

describe('scarce-embed-ledger', () => {
  beforeEach(() => {
    clearScarceEmbedOverride(KEY);
  });

  it('override wins until reconciled', () => {
    setScarceEmbedOverride(
      KEY,
      embed({ status: 'lazy_listing', priceNear: '1' })
    );
    const fetched = embed({
      status: 'none',
      events: [],
    });
    expect(resolveScarceEmbed(KEY, fetched)?.status).toBe('lazy_listing');
  });

  it('fills listingId from fetch while override lacks it', () => {
    setScarceEmbedOverride(
      KEY,
      embed({ status: 'lazy_listing', priceNear: '1' })
    );
    const fetched = embed({
      status: 'lazy_listing',
      listingId: 'll:1',
      priceNear: '1',
    });
    const resolved = resolveScarceEmbed(KEY, fetched);
    expect(resolved?.listingId).toBe('ll:1');
    expect(resolved?.priceNear).toBe('1');
  });

  it('clears override when indexer has listing id', () => {
    setScarceEmbedOverride(
      KEY,
      embed({ status: 'lazy_listing', priceNear: '1' })
    );
    const cleared = reconcileScarceEmbedFromApi(
      KEY,
      embed({ status: 'lazy_listing', listingId: 'll:1', priceNear: '1' })
    );
    expect(cleared).toBe(true);
    expect(getScarceEmbedOverride(KEY)).toBeNull();
  });

  it('clears sold override when API reports sold', () => {
    setScarceEmbedOverride(KEY, embed({ status: 'sold', listingId: 'll:1' }));
    expect(
      reconcileScarceEmbedFromApi(
        KEY,
        embed({ status: 'sold', listingId: 'll:1', tokenId: 's:1' })
      )
    ).toBe(true);
    expect(getScarceEmbedOverride(KEY)).toBeNull();
  });

  it('keeps cancel override until indexer drops the listing', () => {
    setScarceEmbedOverride(KEY, embed({ status: 'none' }));
    expect(
      resolveScarceEmbed(
        KEY,
        embed({ status: 'lazy_listing', listingId: 'll:1', priceNear: '1' })
      )?.status
    ).toBe('none');
    expect(
      reconcileScarceEmbedFromApi(
        KEY,
        embed({ status: 'lazy_listing', listingId: 'll:1' })
      )
    ).toBe(false);
    expect(
      reconcileScarceEmbedFromApi(KEY, embed({ status: 'none' }))
    ).toBe(true);
    expect(getScarceEmbedOverride(KEY)).toBeNull();
  });
});
