import { describe, expect, it } from 'vitest';
import {
  filterHoldingsByMedium,
  groupHoldingsForRail,
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
    expect(holdingsActionLabel('audio')).toBe('Play');
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
    expect(peek.href).toBe('/collection/quiet-hours?read=1');
    expect(peek.actionLabel).toBe('Read');
    expect(peek.kindLabel).toBe('Writing');
  });

  it('routes audio holdings to the Collectibles player', () => {
    const peek = toPortfolioHoldingPeek({
      tokenId: 'album:1',
      title: 'Night Drive',
      ownerId: 'alice.near',
      collectionId: 'album',
      mediumKind: 'audio',
      listingKind: null,
    });
    expect(peek.href).toBe('/collectibles/play?c=album&t=album%3A1');
    expect(peek.actionLabel).toBe('Play');
  });

  it('routes ticket holdings to Show pass on the drop page', () => {
    const peek = toPortfolioHoldingPeek({
      tokenId: 'gate:2',
      title: 'Season Two',
      ownerId: 'alice.near',
      collectionId: 'gate',
      mediumKind: 'ticket',
      listingKind: null,
    });
    expect(peek.href).toBe('/collection/gate?pass=1&t=gate%3A2');
    expect(peek.actionLabel).toBe('Show pass');
  });

  it('routes post scarces to the source post thread', () => {
    expect(
      holdingsHrefForOwned({
        tokenId: 's:abc',
        sourcePostPath: 'alice.near/post/42',
      })
    ).toBe('/@alice.near/posts/42');
  });

  it('prefers a resolved postHref for guild/personal threads', () => {
    expect(
      holdingsHrefForOwned({
        tokenId: 's:abc',
        sourcePostPath: 'alice.near/post/42',
        postHref: '/g/dao.near/posts/alice.near/42',
      })
    ).toBe('/g/dao.near/posts/alice.near/42');
  });

  it('does not link back to market when there is no destination', () => {
    expect(
      holdingsHrefForOwned({ tokenId: 's:post-1', sourcePostPath: undefined })
    ).toBeNull();
    expect(
      toPortfolioHoldingPeek({
        tokenId: 's:post-1',
        title: 'Solo',
        ownerId: 'alice.near',
        listingKind: null,
      }).href
    ).toBe('/collectibles');
  });
});

describe('groupHoldingsForRail', () => {
  it('collapses editions of one collection into a single card with a count', () => {
    const album1 = toPortfolioHoldingPeek({
      tokenId: 'album:1',
      title: 'Onsocial music album #1',
      ownerId: 'alice.near',
      collectionId: 'album',
      mediumKind: 'audio',
      listingKind: null,
    });
    const album2 = toPortfolioHoldingPeek({
      tokenId: 'album:2',
      title: 'Onsocial music album #1',
      ownerId: 'alice.near',
      collectionId: 'album',
      mediumKind: 'audio',
      listingKind: null,
    });
    const solo = toPortfolioHoldingPeek({
      tokenId: 's:post-1',
      title: 'Solo',
      ownerId: 'alice.near',
      listingKind: null,
    });

    const grouped = groupHoldingsForRail([album1, solo, album2]);
    expect(grouped).toHaveLength(2);
    // First occurrence keeps its slot; later editions fold into it.
    expect(grouped[0]).toMatchObject({ tokenId: 'album:1', editionCount: 2 });
    expect(grouped[1]).toMatchObject({ tokenId: 's:post-1', editionCount: 1 });
  });

  it('never merges collectionless tokens', () => {
    const a = toPortfolioHoldingPeek({
      tokenId: 's:a',
      title: 'Same title',
      ownerId: 'alice.near',
      listingKind: null,
    });
    const b = toPortfolioHoldingPeek({
      tokenId: 's:b',
      title: 'Same title',
      ownerId: 'alice.near',
      listingKind: null,
    });
    expect(groupHoldingsForRail([a, b])).toHaveLength(2);
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
      filterHoldingsByMedium(items, 'audio').map((i) => i.tokenId)
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
