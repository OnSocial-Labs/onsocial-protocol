import { describe, expect, it } from 'vitest';
import {
  toCollectionView,
  type LazyCollectionRecord,
} from './collections-data';

function variationRecord(
  overrides: Partial<LazyCollectionRecord> = {}
): LazyCollectionRecord {
  return {
    collection_id: 'egg-1',
    creator_id: 'alice.near',
    total_supply: 5,
    minted_count: 0,
    metadata_template: JSON.stringify({
      title: 'Egg #{seat_number}',
      media: 'https://gateway.example/ipfs/bafy123/{seat_number}.png',
    }),
    ...overrides,
  };
}

describe('toCollectionView cover seat', () => {
  it('fronts the drop with seat 1 by default', () => {
    const view = toCollectionView(variationRecord());
    expect(view?.isVariations).toBe(true);
    expect(view?.mediaUrl).toContain('/1.png');
  });

  it('uses the creator-chosen cover seat from metadata', () => {
    const view = toCollectionView(
      variationRecord({ metadata: JSON.stringify({ cover: { seat: 3 } }) })
    );
    expect(view?.mediaUrl).toContain('/3.png');
  });

  it('falls back to seat 1 when the chosen seat is out of range', () => {
    const view = toCollectionView(
      variationRecord({ metadata: JSON.stringify({ cover: { seat: 7 } }) })
    );
    expect(view?.mediaUrl).toContain('/1.png');
  });

  it('ignores malformed cover metadata', () => {
    const view = toCollectionView(
      variationRecord({ metadata: '{"cover":{"seat":"nope"}}' })
    );
    expect(view?.mediaUrl).toContain('/1.png');
  });

  it('exposes sample piece URLs for variation sets', () => {
    const view = toCollectionView(
      variationRecord({
        metadata: JSON.stringify({ cover: { seat: 3 } }),
        metadata_template: JSON.stringify({
          title: 'Egg #{seat_number}',
          media: 'https://gateway.example/ipfs/bafy123/{seat_number}.png',
          reference:
            'https://gateway.example/ipfs/bafytraits/{seat_number}.json',
        }),
      })
    );
    expect(view?.variationSamples?.length).toBeGreaterThan(0);
    expect(view?.variationSamples?.some((url) => url.includes('/3.png'))).toBe(
      true
    );
    expect(view?.variationSamples?.some((url) => url.includes('/1.png'))).toBe(
      true
    );
    expect(view?.variationReferenceTemplate).toBe(
      'https://gateway.example/ipfs/bafytraits/{seat_number}.json'
    );
  });

  it('strips the seat placeholder from the drop display title', () => {
    const view = toCollectionView(variationRecord());
    expect(view?.title).toBe('Egg');
  });

  it('reads the series pointer alongside the cover', () => {
    const view = toCollectionView(
      variationRecord({
        metadata: JSON.stringify({
          series: { id: 'eggs', title: 'Eggs' },
          cover: { seat: 2 },
        }),
      })
    );
    expect(view?.seriesId).toBe('eggs');
    expect(view?.seriesTitle).toBe('Eggs');
    expect(view?.mediaUrl).toContain('/2.png');
  });

  it('reads audio playables from the token template extra', () => {
    const view = toCollectionView({
      collection_id: 'album-1',
      creator_id: 'alice.near',
      total_supply: 10,
      minted_count: 0,
      metadata_template: JSON.stringify({
        title: 'Album',
        media: 'https://cdn.example/ipfs/bafycover',
        extra: JSON.stringify({
          kind: 'audio',
          playable: [
            { cid: 'bafy1', mime: 'audio/mpeg', title: 'One' },
            { cid: 'bafy2', mime: 'audio/mpeg', title: 'Two' },
            { cid: 'bafy3', mime: 'audio/mpeg', title: 'Three' },
          ],
        }),
      }),
    });
    expect(view?.kind).toBe('audio');
    expect(view?.audioFormat).toBe('album');
    expect(view?.facets).toEqual([]);
    expect(view?.playables.map((t) => t.title)).toEqual([
      'One',
      'Two',
      'Three',
    ]);
    expect(view?.playables.map((t) => t.url)).toEqual([
      expect.stringContaining('bafy1'),
      expect.stringContaining('bafy2'),
      expect.stringContaining('bafy3'),
    ]);
    expect(view?.playables.map((t) => t.cid)).toEqual([
      'bafy1',
      'bafy2',
      'bafy3',
    ]);
  });

  it('keeps album playable order after skipping a bad entry', () => {
    const view = toCollectionView({
      collection_id: 'album-2',
      creator_id: 'alice.near',
      total_supply: 10,
      minted_count: 0,
      metadata_template: JSON.stringify({
        title: 'Album',
        media: 'https://cdn.example/ipfs/bafycover',
        extra: JSON.stringify({
          kind: 'audio',
          playable: [
            { cid: 'bafy1', mime: 'audio/mpeg', title: 'One' },
            { cid: '', mime: 'audio/mpeg', title: 'Broken' },
            { cid: 'bafy3', mime: 'audio/mpeg', title: 'Three' },
          ],
        }),
      }),
    });
    expect(view?.playables.map((t) => t.title)).toEqual(['One', 'Three']);
  });

  it('reads writing manifesto CID and legacy readable chapters', () => {
    const view = toCollectionView({
      collection_id: 'book-1',
      creator_id: 'alice.near',
      total_supply: 10,
      minted_count: 0,
      metadata_template: JSON.stringify({
        title: 'Novella',
        media: 'https://cdn.example/ipfs/bafycover',
        extra: JSON.stringify({
          kind: 'writing',
          writingFormat: 'book',
          writingManifest: 'bafymanifestaaaaaaaaaaaaaaaaaaaa',
          readable: [
            {
              cid: 'bafymd1aaaaaaaaaaaaaaaaaaaaaaaa',
              mime: 'text/markdown',
              title: 'One',
            },
            {
              cid: 'bafymd2aaaaaaaaaaaaaaaaaaaaaaaa',
              mime: 'text/markdown',
              title: 'Two',
            },
          ],
        }),
      }),
    });
    expect(view?.kind).toBe('writing');
    expect(view?.writingFormat).toBe('book');
    expect(view?.audioFormat).toBeNull();
    expect(view?.facets).toEqual([]);
    expect(view?.writingManifestCid).toBe('bafymanifestaaaaaaaaaaaaaaaaaaaa');
    expect(view?.readables.map((t) => t.title)).toEqual(['One', 'Two']);
    expect(view?.readables[0]?.url).toMatch(/^\/api\/ipfs\//);
    expect(view?.bookPdf).toBeNull();
  });

  it('reads manifesto-only writing drops without inline chapters', () => {
    const view = toCollectionView({
      collection_id: 'book-2',
      creator_id: 'alice.near',
      total_supply: 10,
      minted_count: 0,
      metadata_template: JSON.stringify({
        title: 'Essay',
        media: 'https://cdn.example/ipfs/bafycover',
        extra: JSON.stringify({
          kind: 'writing',
          writingFormat: 'article',
          writingManifest: 'bafymanifestaaaaaaaaaaaaaaaaaaaa',
          chapterCount: 1,
        }),
      }),
    });
    expect(view?.kind).toBe('writing');
    expect(view?.writingFormat).toBe('article');
    expect(view?.writingManifestCid).toBe('bafymanifestaaaaaaaaaaaaaaaaaaaa');
    expect(view?.readables).toEqual([]);
  });

  it('reads audioFormat and facets from extra', () => {
    const view = toCollectionView({
      collection_id: 'single-1',
      creator_id: 'alice.near',
      total_supply: 10,
      minted_count: 0,
      metadata_template: JSON.stringify({
        title: 'Track',
        media: 'https://cdn.example/ipfs/bafycover',
        extra: JSON.stringify({
          kind: 'audio',
          audioFormat: 'single',
          facets: ['jazz', 'soul', 'not-a-genre'],
          playable: [{ cid: 'bafy1', mime: 'audio/mpeg', title: 'One' }],
        }),
      }),
    });
    expect(view?.audioFormat).toBe('single');
    expect(view?.facets).toEqual(['jazz', 'soul']);
  });

  it('reads NEP-177 expires_at as accessEndsAtMs for coupons', () => {
    const view = toCollectionView({
      collection_id: 'perk-1',
      creator_id: 'alice.near',
      total_supply: 100,
      minted_count: 0,
      renewable: true,
      metadata_template: JSON.stringify({
        title: 'Coffee',
        media: 'https://cdn.example/ipfs/bafycover',
        expires_at: 1_800_000_000_000,
        extra: JSON.stringify({ kind: 'coupon' }),
      }),
    });
    expect(view?.kind).toBe('coupon');
    expect(view?.accessEndsAtMs).toBe(1_800_000_000_000);
  });

  it('marks early access from Opens time, not allowlist_price', () => {
    const timed = toCollectionView(
      variationRecord({
        start_time: Date.now() + 86_400_000,
        allowlist_price: null,
      })
    );
    expect(timed?.hasAllowlist).toBe(true);

    const untimed = toCollectionView(
      variationRecord({
        allowlist_price: '500000000000000000000000',
      })
    );
    expect(untimed?.hasAllowlist).toBe(false);
  });
});
