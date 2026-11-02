import { describe, expect, it } from 'vitest';
import {
  getPublicAppDiscoverUrl,
  getPublicAppPageUrl,
  getPublicAppRallyUrl,
  getPublicAppStandingUrl,
  normalizePublicAppStandingKind,
  PUBLIC_APP_URL,
} from '@/lib/portal-config';

describe('normalizePublicAppStandingKind', () => {
  it('keeps canonical kinds', () => {
    expect(normalizePublicAppStandingKind('incoming')).toBe('incoming');
    expect(normalizePublicAppStandingKind('outgoing')).toBe('outgoing');
    expect(normalizePublicAppStandingKind('mutual')).toBe('mutual');
  });

  it('maps legacy portal kinds', () => {
    expect(normalizePublicAppStandingKind('solidarity')).toBe('mutual');
    expect(normalizePublicAppStandingKind('standing')).toBe('incoming');
    expect(normalizePublicAppStandingKind('standings')).toBe('incoming');
  });

  it('falls back to incoming for unknown kinds', () => {
    expect(normalizePublicAppStandingKind('whatever')).toBe('incoming');
    expect(normalizePublicAppStandingKind('')).toBe('incoming');
  });
});

describe('app URL builders', () => {
  it('profile page is the canonical person home in the app', () => {
    expect(getPublicAppPageUrl('bob.testnet')).toBe(
      `${PUBLIC_APP_URL}/@bob.testnet`
    );
  });

  it('standing URL normalizes the kind', () => {
    expect(getPublicAppStandingUrl('alice.testnet', 'mutual')).toBe(
      `${PUBLIC_APP_URL}/@alice.testnet/standing/mutual`
    );
    expect(getPublicAppStandingUrl('alice.testnet', 'solidarity')).toBe(
      `${PUBLIC_APP_URL}/@alice.testnet/standing/mutual`
    );
  });

  it('discover URL points at app discover', () => {
    expect(getPublicAppDiscoverUrl()).toBe(`${PUBLIC_APP_URL}/discover`);
  });

  it('rally URL opens the app sheet, including a season', () => {
    expect(getPublicAppRallyUrl(null)).toBe(
      `${PUBLIC_APP_URL}/home?sheet=rally`
    );
    expect(getPublicAppRallyUrl('alice.testnet', 'season-one')).toBe(
      `${PUBLIC_APP_URL}/@alice.testnet?sheet=rally&season=season-one`
    );
    expect(getPublicAppRallyUrl(null, 'not a season')).toBe(
      `${PUBLIC_APP_URL}/home?sheet=rally`
    );
  });
});
