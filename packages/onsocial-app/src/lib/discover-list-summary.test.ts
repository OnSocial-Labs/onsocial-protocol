import { describe, expect, it } from 'vitest';
import {
  buildDiscoverListSummary,
  formatDiscoverSubtitle,
} from './discover-list-summary';

describe('formatDiscoverSubtitle', () => {
  it('uses graph total when available', () => {
    expect(formatDiscoverSubtitle(12_500)).toBe(
      'Browse 12.5K identities on the graph.'
    );
  });

  it('falls back without total', () => {
    expect(formatDiscoverSubtitle(null)).toBe(
      'Browse identities on the OnSocial graph.'
    );
  });
});

describe('buildDiscoverListSummary', () => {
  it('formats search matches while loading more', () => {
    expect(
      buildDiscoverListSummary({
        shownCount: 24,
        hasMore: true,
        query: 'alice',
      })
    ).toBe('Showing 24 matching profiles');
  });

  it('formats discoverable totals when browsing the graph', () => {
    expect(
      buildDiscoverListSummary({
        shownCount: 48,
        hasMore: true,
        query: '',
        discoverableTotal: 12_000,
        indexedProfileTotal: 15_000,
      })
    ).toBe('Showing 48 of 12K discoverable · 15K indexed');
  });
});
