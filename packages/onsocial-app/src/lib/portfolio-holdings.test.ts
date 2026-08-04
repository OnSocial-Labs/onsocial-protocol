import { describe, expect, it } from 'vitest';
import {
  filterHoldingsByMedium,
  holdingsActionLabel,
  holdingsHrefForOwned,
  holdingsKindLabel,
  holdingsMatchQuery,
  toPortfolioHoldingPeek,
} from '@/lib/portfolio-holdings';
import { collectionIdFromTokenId } from '@/features/market/market-listings';

describe('collectionIdFromTokenId', () => {
  it('parses collection editions and skips post scarces', () => {
    expect(collectionIdFromTokenId('novella:3')).toBe('novella');
    expect(collectionIdFromTokenId('s:abc')).toBeNull();
    expect(collectionIdFromTokenId('solo')).toBeNull();
  });
});

describe('holdingsActionLabel', () => {
  it('maps medium kinds to use actions', () => {
    expect(holdingsActionLabel('writing')).toBe('Read');
    expect(holdingsActionLabel('music')).toBe('Play');
    expect(holdingsActionLabel('video')).toBe('Watch');
    expect(holdingsActionLabel('ticket')).toBe('Show pass');
    expect(holdingsActionLabel('coupon')).toBe('Redeem');
    expect(holdingsActionLabel('membership')).toBe('Open pass');
    expect(holdingsActionLabel('thought')).toBe('Open');
    expect(holdingsActionLabel('art')).toBe('Open');
    expect(holdingsActionLabel(null)).toBe('Open');
  });
});

describe('holdingsKindLabel', () => {
  it('uses market medium labels', () => {
    expect(holdingsKindLabel('writing')).toBe('Writing');
    expect(holdingsKindLabel('thought')).toBe('Thoughts');
    expect(holdingsKindLabel('video')).toBe('Video');
    expect(holdingsKindLabel('ticket')).toBe('Tickets');
    expect(holdingsKindLabel(null)).toBeNull();
  });
});

describe('toPortfolioHoldingPeek', () => {
  it('deep-links collection holdings with action copy', () => {
    const peek = toPortfolioHoldingPeek({
      tokenId: 'quiet-hours:1',
      title: 'The Quiet Hours',
      mediaUrl: 'https://cdn.example/cover.png',
      ownerId: 'alice.near',
      collectionId: 'quiet-hours',
      mediumKind: 'writing',
      listingKind: null,
    });
    expect(peek.href).toBe('/collection/quiet-hours');
    expect(peek.actionLabel).toBe('Read');
    expect(peek.kindLabel).toBe('Writing');
  });

  it('routes music holdings to the Collectibles player', () => {
    const peek = toPortfolioHoldingPeek({
      tokenId: 'album:1',
      title: 'Night Drive',
      ownerId: 'alice.near',
      collectionId: 'album',
      mediumKind: 'music',
      listingKind: null,
    });
    expect(peek.href).toBe('/collectibles/play?c=album&t=album%3A1');
    expect(peek.actionLabel).toBe('Play');
  });

  it('falls back to market when there is no collection', () => {
    expect(
      holdingsHrefForOwned({ tokenId: 's:post-1', sourcePostPath: undefined })
    ).toBe('/market');
  });
});

describe('holdingsMatchQuery', () => {
  const item = {
    title: 'Quiet Hours',
    kindLabel: 'Writing',
    actionLabel: 'Read',
    tokenId: 'quiet-hours:1',
  };

  it('matches title, kind, action, or token id', () => {
    expect(holdingsMatchQuery(item, '')).toBe(true);
    expect(holdingsMatchQuery(item, 'quiet')).toBe(true);
    expect(holdingsMatchQuery(item, 'writing')).toBe(true);
    expect(holdingsMatchQuery(item, 'read')).toBe(true);
    expect(holdingsMatchQuery(item, 'quiet-hours')).toBe(true);
    expect(holdingsMatchQuery(item, 'ticket')).toBe(false);
  });
});

describe('filterHoldingsByMedium', () => {
  const items = [
    { tokenId: 'a', mediumKind: 'writing' as string | null },
    { tokenId: 'b', mediumKind: 'music' as string | null },
    { tokenId: 'c', mediumKind: null },
    { tokenId: 'd', mediumKind: 'thought' as string | null },
    { tokenId: 'e', mediumKind: 'video' as string | null },
  ];

  it('returns all items for the All tab', () => {
    expect(filterHoldingsByMedium(items, 'all')).toHaveLength(5);
  });

  it('keeps matching kinds and drops unknown on kind tabs', () => {
    expect(
      filterHoldingsByMedium(items, 'writing').map((i) => i.tokenId)
    ).toEqual(['a']);
    expect(
      filterHoldingsByMedium(items, 'music').map((i) => i.tokenId)
    ).toEqual(['b']);
    expect(filterHoldingsByMedium(items, 'ticket')).toEqual([]);
    expect(
      filterHoldingsByMedium(items, 'thought').map((i) => i.tokenId)
    ).toEqual(['d']);
    expect(
      filterHoldingsByMedium(items, 'video').map((i) => i.tokenId)
    ).toEqual(['e']);
  });
});
