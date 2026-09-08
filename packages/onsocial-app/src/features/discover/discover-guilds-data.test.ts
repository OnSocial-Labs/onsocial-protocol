import { describe, expect, it } from 'vitest';
import {
  DISCOVER_GUILDS_LOAD_MORE_ERROR,
  DISCOVER_GUILDS_SEARCH_ERROR,
  discoverGuildsLoadMoreError,
  discoverGuildsSearchError,
} from '@/features/discover/discover-guilds-data';

describe('discover guilds catalog errors', () => {
  it('keeps a typed load-more error and falls back when the page fails', () => {
    expect(
      discoverGuildsLoadMoreError(new Error('Indexed browse timed out.'))
    ).toBe('Indexed browse timed out.');
    expect(discoverGuildsLoadMoreError('nope')).toBe(
      DISCOVER_GUILDS_LOAD_MORE_ERROR
    );
    expect(discoverGuildsLoadMoreError(new Error('   '))).toBe(
      DISCOVER_GUILDS_LOAD_MORE_ERROR
    );
  });

  it('keeps a typed search error and falls back when the query fails', () => {
    expect(
      discoverGuildsSearchError(new Error('Indexed search timed out.'))
    ).toBe('Indexed search timed out.');
    expect(discoverGuildsSearchError('nope')).toBe(DISCOVER_GUILDS_SEARCH_ERROR);
    expect(discoverGuildsSearchError(new Error('   '))).toBe(
      DISCOVER_GUILDS_SEARCH_ERROR
    );
  });
});
