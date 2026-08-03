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

  it('reads music playables from the token template extra', () => {
    const view = toCollectionView({
      collection_id: 'album-1',
      creator_id: 'alice.near',
      total_supply: 10,
      minted_count: 0,
      metadata_template: JSON.stringify({
        title: 'Album',
        media: 'https://cdn.example/ipfs/bafycover',
        extra: JSON.stringify({
          kind: 'music',
          playable: [
            { cid: 'bafy1', mime: 'audio/mpeg', title: 'One' },
            { cid: 'bafy2', mime: 'audio/mpeg', title: 'Two' },
            { cid: 'bafy3', mime: 'audio/mpeg', title: 'Three' },
          ],
        }),
      }),
    });
    expect(view?.kind).toBe('music');
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
          kind: 'music',
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
            { cid: 'bafymd1aaaaaaaaaaaaaaaaaaaaaaaa', mime: 'text/markdown', title: 'One' },
            { cid: 'bafymd2aaaaaaaaaaaaaaaaaaaaaaaa', mime: 'text/markdown', title: 'Two' },
          ],
        }),
      }),
    });
    expect(view?.kind).toBe('writing');
    expect(view?.writingFormat).toBe('book');
    expect(view?.writingManifestCid).toBe('bafymanifestaaaaaaaaaaaaaaaaaaaa');
    expect(view?.readables.map((t) => t.title)).toEqual(['One', 'Two']);
    expect(view?.readables[0]?.url).toMatch(/^\/api\/ipfs\//);
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
});
