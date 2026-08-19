import { describe, expect, it } from 'vitest';
import {
  daosAppTabHref,
  daosAppTabLabel,
  parseDaosAppTab,
} from '@/features/protocol/daos-app-tabs';

describe('daos app tabs', () => {
  it('defaults to home', () => {
    expect(parseDaosAppTab(null)).toBe('home');
    expect(parseDaosAppTab('')).toBe('home');
    expect(parseDaosAppTab('nope')).toBe('home');
  });

  it('parses explore', () => {
    expect(parseDaosAppTab('explore')).toBe('explore');
    expect(parseDaosAppTab('Explore')).toBe('explore');
  });

  it('labels and hrefs', () => {
    expect(daosAppTabLabel('home')).toBe('Home');
    expect(daosAppTabLabel('explore')).toBe('Explore');
    expect(daosAppTabHref('home')).toBe('/daos');
    expect(daosAppTabHref('explore')).toBe('/daos?tab=explore');
  });
});
