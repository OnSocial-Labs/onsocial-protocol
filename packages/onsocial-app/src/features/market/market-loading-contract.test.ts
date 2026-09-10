import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const marketSrc = dirname(fileURLToPath(import.meta.url));

describe('market loading contract', () => {
  it('derives cold, refresh, append, and error presentation from the shared contract', () => {
    const source = readFileSync(
      join(marketSrc, 'market-page-panel.tsx'),
      'utf8'
    );

    expect(source).toContain('resolveAppLoadingPresentation');
    expect(source).toContain('showListSkeleton');
    expect(source).toContain('showCatalogRefreshing');
    expect(source).toContain('showAppendSkeleton');
    expect(source).toContain('listingsError');
    expect(source).toContain('errorPresentation');
  });

  it('keeps refresh failures separate from the empty-list failure state', () => {
    const source = readFileSync(
      join(marketSrc, 'market-page-panel.tsx'),
      'utf8'
    );

    expect(source).toContain("setListingsError('Couldn’t load listings.')");
    expect(source).toContain('failed: current.items.length === 0');
  });

  it('keeps creator-shop listing-type chips out of the route loading shell', () => {
    const source = readFileSync(
      join(marketSrc, 'market-loading-screen.tsx'),
      'utf8'
    );

    expect(source).toContain('hideListingTypes={Boolean(query.creator)}');
  });
});
