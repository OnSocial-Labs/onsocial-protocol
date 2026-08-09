import { describe, expect, it, beforeEach } from 'vitest';
import type { PostScarceEmbed } from '@onsocial/sdk';
import {
  clearScarceEmbedOverride,
  getScarceEmbedOverride,
  getScarceEmbedSeed,
  reconcileScarceEmbedFromApi,
  resolveScarceEmbed,
  seedScarceEmbedsFromSsr,
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

  it('does not inherit media from a different listing id', () => {
    setScarceEmbedOverride(
      KEY,
      embed({
        status: 'lazy_listing',
        listingId: 'll:new',
        priceNear: '2',
        mediaUrl: 'https://cdn.example/new.png',
      })
    );
    const resolved = resolveScarceEmbed(
      KEY,
      embed({
        status: 'lazy_listing',
        listingId: 'll:old',
        priceNear: '1',
        mediaUrl: 'https://cdn.example/old.png',
        cardBg: 'thought-night',
      })
    );
    expect(resolved?.listingId).toBe('ll:new');
    expect(resolved?.mediaUrl).toBe('https://cdn.example/new.png');
    expect(resolved?.cardBg).toBeUndefined();
  });

  it('keeps seeded override when fetch returns a different listing id', () => {
    setScarceEmbedOverride(
      KEY,
      embed({
        status: 'lazy_listing',
        listingId: 'll:new',
        mediaUrl: 'https://cdn.example/new.png',
      })
    );
    expect(
      reconcileScarceEmbedFromApi(
        KEY,
        embed({
          status: 'lazy_listing',
          listingId: 'll:old',
          mediaUrl: 'https://cdn.example/old.png',
        })
      )
    ).toBe(false);
    expect(getScarceEmbedOverride(KEY)?.listingId).toBe('ll:new');
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
    expect(reconcileScarceEmbedFromApi(KEY, embed({ status: 'none' }))).toBe(
      true
    );
    expect(getScarceEmbedOverride(KEY)).toBeNull();
  });

  it('overwrites stale SSR seeds but never clobbers overrides', () => {
    seedScarceEmbedsFromSsr({
      [KEY]: embed({
        status: 'lazy_listing',
        listingId: 'll:old',
        priceNear: '1',
      }),
    });
    expect(getScarceEmbedSeed(KEY)?.listingId).toBe('ll:old');

    seedScarceEmbedsFromSsr({
      [KEY]: embed({
        status: 'lazy_listing',
        listingId: 'll:new',
        priceNear: '2',
      }),
    });
    expect(getScarceEmbedSeed(KEY)?.listingId).toBe('ll:new');
    expect(getScarceEmbedSeed(KEY)?.priceNear).toBe('2');

    setScarceEmbedOverride(
      KEY,
      embed({ status: 'drop', collectionId: 'drop:1', priceNear: '3' })
    );
    seedScarceEmbedsFromSsr({
      [KEY]: embed({
        status: 'lazy_listing',
        listingId: 'll:ignored',
        priceNear: '9',
      }),
    });
    expect(getScarceEmbedSeed(KEY)?.listingId).toBe('ll:new');
    expect(getScarceEmbedOverride(KEY)?.collectionId).toBe('drop:1');
  });
});
