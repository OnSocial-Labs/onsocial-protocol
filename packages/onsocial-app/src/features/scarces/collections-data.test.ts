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
});
