import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, beforeEach } from 'vitest';
import type { PostScarceEmbed } from '@onsocial/sdk';
import { scarceCtaPriceLabel } from '@/features/scarces/post-scarce-cta';
import {
  SCARCE_EMBED_SEED_CACHE_LIMIT,
  clearScarceEmbedLedger,
  clearScarceEmbedOverrides,
  getScarceEmbedOverride,
  getScarceEmbedSeed,
  reconcileScarceEmbedFromApi,
  rememberScarceEmbedFetch,
  resolveScarceEmbed,
  scarceEmbedSeedCacheSize,
  seedScarceEmbedsFromSsr,
  setScarceEmbedOverride,
  stickScarceCommercePaint,
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
    clearScarceEmbedLedger();
  });

  it('evicts the oldest SSR scarce seeds once the LRU cap is hit', () => {
    const map: Record<string, PostScarceEmbed> = {};
    for (let i = 0; i < SCARCE_EMBED_SEED_CACHE_LIMIT + 5; i += 1) {
      map[`alice.near/post/lru-${i}`] = embed({
        status: 'lazy_listing',
        listingId: `ll:${i}`,
      });
    }
    seedScarceEmbedsFromSsr(map);
    expect(scarceEmbedSeedCacheSize()).toBe(SCARCE_EMBED_SEED_CACHE_LIMIT);
    expect(getScarceEmbedSeed('alice.near/post/lru-0')).toBeNull();
    expect(
      getScarceEmbedSeed(
        `alice.near/post/lru-${SCARCE_EMBED_SEED_CACHE_LIMIT + 4}`
      )?.listingId
    ).toBe(`ll:${SCARCE_EMBED_SEED_CACHE_LIMIT + 4}`);
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

  it('keeps override cover until indexer mediaUrl lands', () => {
    setScarceEmbedOverride(
      KEY,
      embed({
        status: 'lazy_listing',
        listingId: 'll:1',
        mediaUrl: 'data:image/png;base64,abc',
        priceNear: '1',
      })
    );
    expect(
      reconcileScarceEmbedFromApi(
        KEY,
        embed({ status: 'lazy_listing', listingId: 'll:1', priceNear: '1' })
      )
    ).toBe(false);
    expect(getScarceEmbedOverride(KEY)?.mediaUrl).toBe(
      'data:image/png;base64,abc'
    );

    expect(
      reconcileScarceEmbedFromApi(
        KEY,
        embed({
          status: 'lazy_listing',
          listingId: 'll:1',
          mediaUrl: 'https://ipfs.example/mint.png',
          priceNear: '1',
        })
      )
    ).toBe(true);
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

  it('takes the fetched ask when the listing changes; never clobbers overrides', () => {
    seedScarceEmbedsFromSsr({
      [KEY]: embed({
        status: 'lazy_listing',
        listingId: 'll:old',
        priceNear: '1',
        usdE6: '2500000',
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
    expect(getScarceEmbedSeed(KEY)?.usdE6).toBeUndefined();
    expect(
      renderToStaticMarkup(
        createElement(
          'span',
          null,
          scarceCtaPriceLabel(getScarceEmbedSeed(KEY) ?? embed({}))
        )
      )
    ).toBe('<span>2 NEAR</span>');

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

  it('first seed can include dollars; later seeds stick NEAR-only paint', () => {
    seedScarceEmbedsFromSsr({
      [KEY]: embed({
        status: 'lazy_listing',
        listingId: 'll:1',
        priceNear: '1',
        usdE6: '2500000',
      }),
    });
    expect(getScarceEmbedSeed(KEY)?.usdE6).toBe('2500000');

    seedScarceEmbedsFromSsr({
      [KEY]: embed({
        status: 'lazy_listing',
        listingId: 'll:1',
        priceNear: '1',
      }),
    });
    expect(getScarceEmbedSeed(KEY)?.usdE6).toBe('2500000');

    clearScarceEmbedLedger();
    seedScarceEmbedsFromSsr({
      [KEY]: embed({
        status: 'lazy_listing',
        listingId: 'll:1',
        priceNear: '1',
      }),
    });
    seedScarceEmbedsFromSsr({
      [KEY]: embed({
        status: 'lazy_listing',
        listingId: 'll:1',
        priceNear: '1',
        usdE6: '2500000',
      }),
    });
    expect(getScarceEmbedSeed(KEY)?.usdE6).toBeUndefined();
    expect(getScarceEmbedSeed(KEY)?.priceNear).toBe('1');
  });

  it('sticks painted currency when the ask is unchanged; a new ask is taken', () => {
    const painted = embed({
      status: 'lazy_listing',
      listingId: 'll:1',
      priceNear: '1',
      usdE6: '2500000',
      remaining: 3,
    });
    const sameAsk = stickScarceCommercePaint(
      painted,
      embed({
        status: 'sold',
        listingId: 'll:1',
        priceNear: '1',
        remaining: 0,
      })
    );
    expect(sameAsk.status).toBe('sold');
    expect(sameAsk.remaining).toBe(0);
    expect(sameAsk.usdE6).toBe('2500000');
    expect(sameAsk.priceNear).toBe('1');

    const newAsk = stickScarceCommercePaint(
      painted,
      embed({
        status: 'lazy_listing',
        listingId: 'll:1',
        priceNear: '9',
        remaining: 0,
      })
    );
    expect(newAsk.priceNear).toBe('9');
    expect(newAsk.usdE6).toBeUndefined();
    expect(newAsk.remaining).toBe(0);
  });

  it('takes fetched dollars when the ask changes on the same listing', () => {
    const painted = embed({
      status: 'lazy_listing',
      listingId: 'll:1',
      priceNear: '1',
    });
    const refreshed = stickScarceCommercePaint(
      painted,
      embed({
        status: 'lazy_listing',
        listingId: 'll:1',
        priceNear: '2',
        usdE6: '2500000',
      })
    );
    expect(refreshed.priceNear).toBe('2');
    expect(refreshed.usdE6).toBe('2500000');
  });

  it('remembers fetches so recycled cards remount with commerce', () => {
    rememberScarceEmbedFetch(
      KEY,
      embed({
        status: 'lazy_listing',
        listingId: 'll:1',
        priceNear: '1',
        usdE6: '2500000',
      }),
      { notify: false }
    );
    expect(getScarceEmbedSeed(KEY)?.listingId).toBe('ll:1');
    expect(getScarceEmbedSeed(KEY)?.usdE6).toBe('2500000');

    rememberScarceEmbedFetch(
      KEY,
      embed({
        status: 'lazy_listing',
        listingId: 'll:1',
        priceNear: '1',
        remaining: 1,
      }),
      { notify: false }
    );
    expect(getScarceEmbedSeed(KEY)?.priceNear).toBe('1');
    expect(getScarceEmbedSeed(KEY)?.usdE6).toBe('2500000');
    expect(getScarceEmbedSeed(KEY)?.remaining).toBe(1);

    rememberScarceEmbedFetch(
      KEY,
      embed({
        status: 'lazy_listing',
        listingId: 'll:1',
        priceNear: '9',
        remaining: 1,
      }),
      { notify: false }
    );
    expect(getScarceEmbedSeed(KEY)?.priceNear).toBe('9');
    expect(getScarceEmbedSeed(KEY)?.usdE6).toBeUndefined();
  });

  it('clears optimistic overrides without dropping indexer seeds', () => {
    seedScarceEmbedsFromSsr({
      [KEY]: embed({
        status: 'lazy_listing',
        listingId: 'll:1',
        priceNear: '2',
      }),
    });
    setScarceEmbedOverride(
      KEY,
      embed({ status: 'lazy_listing', priceNear: '1' })
    );
    clearScarceEmbedOverrides();
    expect(getScarceEmbedOverride(KEY)).toBeNull();
    expect(getScarceEmbedSeed(KEY)?.listingId).toBe('ll:1');
    expect(getScarceEmbedSeed(KEY)?.priceNear).toBe('2');
  });
});
