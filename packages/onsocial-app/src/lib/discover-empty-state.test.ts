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
  it('includes recovery actions for search misses', () => {
    expect(buildDiscoverEmptyState('alice')).toEqual({
      primary: 'No matches for "alice" on the graph.',
      secondary: 'Try another name or account.',
      showClearSearch: true,
    });
  });

  it('uses list empty copy without clear search', () => {
    expect(buildDiscoverEmptyState('')).toEqual({
      primary: 'No profiles found yet.',
      showClearSearch: false,
    });
  });
});
