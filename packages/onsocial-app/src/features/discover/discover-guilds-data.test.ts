import { describe, expect, it } from 'vitest';
import {
  DISCOVER_GUILDS_LOAD_MORE_ERROR,
  discoverGuildsLoadMoreError,
} from '@/features/discover/discover-guilds-data';

describe('discoverGuildsLoadMoreError', () => {
  it('keeps a typed error and falls back when the page fails', () => {
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
});
