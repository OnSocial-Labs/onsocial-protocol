import { describe, expect, it } from 'vitest';
import { shouldSeedMarketDefaultBrowse } from '@/lib/load-market-page';
import {
  marketPath,
  parseMarketSortParam,
} from '@/lib/app-routes';

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

describe('shouldSeedMarketDefaultBrowse', () => {
  it('seeds only the unfiltered newest catalog', () => {
    expect(shouldSeedMarketDefaultBrowse({})).toBe(true);
    expect(shouldSeedMarketDefaultBrowse({ sort: 'newest' })).toBe(true);
  });

  it('skips SSR seed when the URL already narrows discovery', () => {
    expect(shouldSeedMarketDefaultBrowse({ kind: 'ticket' })).toBe(false);
    expect(shouldSeedMarketDefaultBrowse({ sort: 'ending' })).toBe(false);
    expect(shouldSeedMarketDefaultBrowse({ creator: 'alice.near' })).toBe(
      false
    );
    expect(shouldSeedMarketDefaultBrowse({ audioFormat: 'podcast' })).toBe(
      false
    );
  });
});
