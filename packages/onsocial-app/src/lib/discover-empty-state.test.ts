import { describe, expect, it } from 'vitest';
import {
  buildDiscoverEmptyState,
  buildDiscoverSearchEmptyPrimary,
} from './discover-empty-state';

describe('buildDiscoverSearchEmptyPrimary', () => {
  it('scopes search misses to the graph', () => {
    expect(buildDiscoverSearchEmptyPrimary('alice')).toBe(
      'No matches for "alice" on the graph.'
    );
  });
});

describe('buildDiscoverEmptyState', () => {
  it('keeps search misses quiet — field X clears', () => {
    expect(buildDiscoverEmptyState('alice')).toEqual({
      primary: 'No matches.',
      showClearSearch: false,
    });
  });

  it('uses list empty copy without clear search', () => {
    expect(buildDiscoverEmptyState('')).toEqual({
      primary: 'No profiles found yet.',
      showClearSearch: false,
    });
  });

  it('guides topic drafts to Home instead of people search misses', () => {
    expect(buildDiscoverEmptyState('#near')).toEqual({
      primary: 'Press Enter or pick a suggestion to open this in Home.',
      secondary: 'Topics and tickers live in the Home feed.',
      showClearSearch: false,
    });
  });
});
