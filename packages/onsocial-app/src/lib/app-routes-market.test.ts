import { describe, expect, it } from 'vitest';
import {
  EMPTY_MARKET_PAGE_QUERY,
  marketBrowseParamsKey,
  marketQueryPath,
  marketSeedParamsKey,
  parseMarketPageQuery,
  parseMarketPageQueryFromSearch,
} from '@/lib/load-market-page';
import { parseMarketMediumFilter } from '@/features/market/market-medium';
import { listingFilterFromSort } from '@/features/market/market-listing-filter';
import { marketPath, parseMarketSortParam } from '@/lib/app-routes';

describe('parseMarketSortParam', () => {
  it('defaults to newest', () => {
    expect(parseMarketSortParam(null)).toBe('newest');
    expect(parseMarketSortParam('')).toBe('newest');
    expect(parseMarketSortParam('nope')).toBe('newest');
  });

  it('accepts known sorts', () => {
    expect(parseMarketSortParam('ending')).toBe('ending');
    expect(parseMarketSortParam('price-asc')).toBe('price-asc');
  });
});

describe('marketPath', () => {
  it('omits default newest sort', () => {
    expect(marketPath()).toBe('/market');
    expect(marketPath({ sort: 'newest' })).toBe('/market');
  });

  it('encodes kind and sort', () => {
    expect(marketPath({ kind: 'audio', sort: 'ending' })).toBe(
      '/market?kind=audio&sort=ending'
    );
  });
});

describe('parseMarketMediumFilter', () => {
  it('maps legacy music to audio', () => {
    expect(parseMarketMediumFilter('music')).toBe('audio');
    expect(parseMarketMediumFilter('ticket')).toBe('ticket');
    expect(parseMarketMediumFilter('nope')).toBe('all');
  });
});

describe('parseMarketPageQuery', () => {
  it('defaults to the open catalog', () => {
    expect(parseMarketPageQuery({})).toEqual(EMPTY_MARKET_PAGE_QUERY);
  });

  it('reads discovery URL params', () => {
    const query = parseMarketPageQuery({
      kind: 'audio',
      audioFormat: 'podcast',
      sort: 'ending',
    });
    expect(query.kind).toBe('audio');
    expect(query.audioFormat).toBe('podcast');
    expect(query.sort).toBe('ending');
    expect(listingFilterFromSort(query.sort)).toBe('auctions');
  });

  it('parses window search', () => {
    expect(
      parseMarketPageQueryFromSearch('?kind=ticket&sort=newest')
    ).toMatchObject({ kind: 'ticket', sort: 'newest' });
  });
});

describe('marketBrowseParamsKey', () => {
  it('matches the default All / newest catalog key', () => {
    expect(
      marketBrowseParamsKey({
        listingFilter: 'all',
        sort: 'newest',
        kind: 'all',
      })
    ).toBe('0|all|newest||||all||');
  });

  it('seeds ending sort onto the auctions key', () => {
    const query = parseMarketPageQuery({ sort: 'ending' });
    expect(marketSeedParamsKey(query)).toBe('0|auctions|ending||||all||');
  });

  it('builds a path that omits default All / newest', () => {
    expect(marketQueryPath(EMPTY_MARKET_PAGE_QUERY)).toBe('/market');
    expect(
      marketQueryPath(parseMarketPageQuery({ kind: 'ticket' }))
    ).toBe('/market?kind=ticket');
  });
});
