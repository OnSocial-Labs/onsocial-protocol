import { describe, expect, it } from 'vitest';
import {
  catalogCreatorIlike,
  catalogDropMatches,
  catalogDropMeta,
  catalogFacetContainsPattern,
  catalogFacetIdForQuery,
  isDiscoverCatalogQuery,
  visibleCatalogSectionIds,
} from '@/features/discover/discover-catalog';

describe('discover catalog search', () => {
  it('uses a plain word and leaves topic drafts on their tabs', () => {
    expect(isDiscoverCatalogQuery('fiction')).toBe(true);
    expect(isDiscoverCatalogQuery('  night ')).toBe(true);
    expect(isDiscoverCatalogQuery('')).toBe(false);
    expect(isDiscoverCatalogQuery('#near')).toBe(false);
    expect(isDiscoverCatalogQuery('$SOCIAL')).toBe(false);
  });

  it('matches a subject or genre from the closed list', () => {
    expect(catalogFacetIdForQuery('Fiction', 'writing')).toBe('fiction');
    expect(catalogFacetIdForQuery('sci', 'writing')).toBe('scifi');
    expect(catalogFacetIdForQuery('jazz', 'audio')).toBe('jazz');
    expect(catalogFacetIdForQuery('night', 'writing')).toBeNull();
    expect(catalogFacetIdForQuery('r', 'audio')).toBeNull();
  });

  it('matches a drop by title, creator, or stamped subject', () => {
    const book = {
      title: 'Night Drive',
      creatorId: 'ada.testnet',
      mediumKind: 'writing',
      kind: null,
      extraJson: JSON.stringify({
        kind: 'writing',
        writingFormat: 'book',
        facets: ['fiction'],
      }),
    };
    expect(catalogDropMatches(book, 'night', 'fiction')).toBe(true);
    expect(catalogDropMatches(book, 'ada.testnet', null)).toBe(true);
    expect(catalogDropMatches(book, 'ada', null)).toBe(true);
    expect(catalogDropMatches({ ...book, title: 'Other' }, 'test', null)).toBe(
      false
    );
    expect(
      catalogDropMatches(
        { ...book, title: 'Other', creatorId: 'ada.near' },
        'near',
        null
      )
    ).toBe(false);
    expect(catalogDropMatches(book, 'fiction', 'fiction')).toBe(true);
    expect(
      catalogDropMatches(
        {
          ...book,
          title: 'Other',
          extraJson: JSON.stringify({ facets: ['nonfiction'] }),
        },
        'fiction',
        'fiction'
      )
    ).toBe(false);
    expect(catalogDropMeta(book)).toBe('Book · ada.testnet');
    expect(catalogFacetContainsPattern('fiction')).toBe('%"fiction"%');
    expect(catalogCreatorIlike('Test')).toEqual({
      prefix: 'test%',
      label: '%.test.%',
    });
    expect(
      catalogDropMeta({
        title: 'Night',
        creatorId: 'ada.testnet',
        mediumKind: 'audio',
        kind: 'music',
        extraJson: JSON.stringify({
          kind: 'music',
          playable: [{ title: 'One' }, { title: 'Two' }],
        }),
      })
    ).toBe('Album · ada.testnet');
  });

  it('hides empty sections and keeps the reading order', () => {
    expect(
      visibleCatalogSectionIds({
        people: 1,
        articles: 0,
        books: 2,
        music: 0,
        events: 1,
      })
    ).toEqual(['people', 'books', 'events']);
  });
});
