import { describe, expect, it } from 'vitest';
import {
  articleRowsPage,
  discoverArticleByline,
  catalogCreatorIlike,
  catalogDropMatches,
  catalogDropMeta,
  catalogFacetContainsPattern,
  catalogFacetIdForQuery,
  isArticlesSearchUnavailable,
  isDiscoverCatalogQuery,
  visibleCatalogSectionIds,
} from '@/features/discover/discover-catalog';

describe('discover catalog search', () => {
  it('writes the essay author the way the article page does', () => {
    expect(discoverArticleByline('alice.testnet', 'Alice')).toBe(
      'by Alice · @alice.testnet'
    );
    expect(discoverArticleByline('alice.testnet', 'Sam')).toBe(
      'by Sam · @alice.testnet'
    );
  });

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

  it('treats a missing essay index as the post-body scan', () => {
    expect(
      isArticlesSearchUnavailable(
        "field 'articlesSearch' not found in type: 'query_root'"
      )
    ).toBe(true);
    expect(isArticlesSearchUnavailable('articles_search does not exist')).toBe(
      true
    );
    expect(isArticlesSearchUnavailable('network down')).toBe(false);
  });

  it('pages essays newest first without repeating the cursor', () => {
    const rows = [
      { postId: 'b', blockHeight: 10 },
      { postId: 'a', blockHeight: 20 },
      { postId: 'c', blockHeight: 20 },
      { postId: 'd', blockHeight: 5 },
    ];
    expect(articleRowsPage(rows, 2, null)).toEqual({
      items: [
        { postId: 'c', blockHeight: 20 },
        { postId: 'a', blockHeight: 20 },
      ],
      hasMore: true,
    });
    expect(
      articleRowsPage(rows, 2, { blockHeight: 20, postId: 'a' }).items.map(
        (row) => row.postId
      )
    ).toEqual(['b', 'd']);
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
