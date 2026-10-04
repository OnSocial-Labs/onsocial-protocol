import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  getPublicAppDiscoverUrl,
  getPublicAppPageUrl,
  getPublicAppStandingUrl,
  normalizePublicAppStandingKind,
  PUBLIC_APP_URL,
} from '@/lib/portal-config';

const require = createRequire(import.meta.url);

type RedirectEntry = {
  source: string;
  destination: string;
  permanent: boolean;
};

async function loadSocialRedirects(): Promise<RedirectEntry[]> {
  const config = require('../../next.config.js') as {
    redirects: () => Promise<RedirectEntry[]>;
  };
  return config.redirects();
}

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
});

describe('next.config social redirects', () => {
  it('hands portal social routes to the app as temporary redirects', async () => {
    const redirects = await loadSocialRedirects();
    const bySource = new Map(redirects.map((entry) => [entry.source, entry]));

    const expectations: Record<string, string> = {
      '/u/:accountId': `${PUBLIC_APP_URL}/@:accountId`,
      '/u/:accountId/endorsements': `${PUBLIC_APP_URL}/@:accountId/endorsements`,
      '/u/:accountId/endorsements/supporters': `${PUBLIC_APP_URL}/@:accountId/endorsements`,
      '/u/:accountId/stand/solidarity': `${PUBLIC_APP_URL}/@:accountId/standing/mutual`,
      '/u/:accountId/stand/standing': `${PUBLIC_APP_URL}/@:accountId/standing/incoming`,
      '/u/:accountId/stand/standings': `${PUBLIC_APP_URL}/@:accountId/standing/incoming`,
      '/u/:accountId/stand/:kind': `${PUBLIC_APP_URL}/@:accountId/standing/:kind`,
      '/discover': `${PUBLIC_APP_URL}/discover`,
    };

    for (const [source, destination] of Object.entries(expectations)) {
      const entry = bySource.get(source);
      expect(entry, source).toBeDefined();
      expect(entry?.destination, source).toBe(destination);
      expect(entry?.permanent, source).toBe(false);
    }
  });

  it('keeps the network orbit on the portal', async () => {
    const redirects = await loadSocialRedirects();
    expect(redirects.some((entry) => entry.source.includes('network'))).toBe(
      false
    );
  });
});
