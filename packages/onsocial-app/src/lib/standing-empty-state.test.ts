import { describe, expect, it } from 'vitest';
import {
  buildStandingEmptyState,
  buildStandingSearchEmptyPrimary,
} from './standing-empty-state';

describe('buildStandingSearchEmptyPrimary', () => {
  it('scopes incoming search to people standing with the subject', () => {
    expect(
      buildStandingSearchEmptyPrimary('incoming', true, 'You', 'alice')
    ).toBe('No matches for "alice" among people standing with you.');

    expect(
      buildStandingSearchEmptyPrimary('incoming', false, 'Bob', 'alice')
    ).toBe('No matches for "alice" among people standing with Bob.');
  });

  it('scopes outgoing search to people the subject stands with', () => {
    expect(
      buildStandingSearchEmptyPrimary('outgoing', true, 'You', 'alice')
    ).toBe('No matches for "alice" among people you stand with.');

    expect(
      buildStandingSearchEmptyPrimary('outgoing', false, 'Bob', 'alice')
    ).toBe('No matches for "alice" among people Bob stands with.');
  });

  it('uses solidarity copy for mutual search', () => {
    expect(
      buildStandingSearchEmptyPrimary('mutual', true, 'You', 'alice')
    ).toBe('No solidarity matches "alice".');
  });
});

describe('buildStandingEmptyState', () => {
  it('includes recovery actions for search misses', () => {
    expect(
      buildStandingEmptyState({
        kind: 'outgoing',
        isSelf: true,
        displayName: 'You',
        query: 'alice',
        showDiscoverLink: true,
      })
    ).toEqual({
      primary: 'No matches for "alice" among people you stand with.',
      secondary: 'Try another name or handle.',
      showClearSearch: true,
      showDiscover: true,
    });
  });

  it('keeps discover on list empty without clear search', () => {
    expect(
      buildStandingEmptyState({
        kind: 'outgoing',
        isSelf: true,
        displayName: 'You',
        query: '',
        showDiscoverLink: true,
      })
    ).toEqual({
      primary: 'You do not stand with anyone yet.',
      showClearSearch: false,
      showDiscover: true,
    });
  });
});
