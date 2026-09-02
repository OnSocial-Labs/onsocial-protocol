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

  it('scopes outgoing search to standing targets', () => {
    expect(
      buildStandingSearchEmptyPrimary('outgoing', true, 'You', 'alice')
    ).toBe('No matches for "alice" in who you stand with.');

    expect(
      buildStandingSearchEmptyPrimary('outgoing', false, 'Bob', 'alice')
    ).toBe('No matches for "alice" in who Bob stands with.');
  });

  it('uses solidarity copy for mutual search', () => {
    expect(
      buildStandingSearchEmptyPrimary('mutual', true, 'You', 'alice')
    ).toBe('No solidarity matches "alice".');
  });
});

describe('buildStandingEmptyState', () => {
  it('keeps search misses quiet — field X clears', () => {
    expect(
      buildStandingEmptyState({
        kind: 'outgoing',
        isSelf: true,
        displayName: 'You',
        query: 'alice',
        showDiscoverLink: true,
      })
    ).toEqual({
      primary: 'No matches.',
      showClearSearch: false,
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
