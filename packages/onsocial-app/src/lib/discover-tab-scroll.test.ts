import { describe, expect, it } from 'vitest';
import {
  readDiscoverTabScroll,
  rememberDiscoverTabScroll,
} from './discover-tab-scroll';

describe('discover tab scroll', () => {
  it('remembers a tab offset and reads it back', () => {
    const stored = rememberDiscoverTabScroll({}, 'profiles', 420);
    expect(readDiscoverTabScroll(stored, 'profiles')).toBe(420);
    expect(readDiscoverTabScroll(stored, 'daos')).toBe(0);
  });

  it('ignores invalid offsets', () => {
    expect(rememberDiscoverTabScroll({}, 'guilds', -12)).toEqual({});
    expect(readDiscoverTabScroll({ hubs: Number.NaN }, 'hubs')).toBe(0);
  });
});
