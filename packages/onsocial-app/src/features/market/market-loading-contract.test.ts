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
    expect(source).toContain('marketBrowseColdPending');
    expect(source).toContain('showListSkeleton');
    expect(source).toContain('showCatalogRefreshing');
    expect(source).toContain('showAppendPending');
    expect(source).toContain("loadingPresentation === 'append-pending'");
    expect(source).toContain('hasPaintedRows = listings.length > 0');
    expect(source).not.toContain(
      'hasPaintedRows = listings.length > 0 && listingsReady'
    );
    expect(source).toContain('reserveSalesSeat');
    expect(source).toContain('browseColdPending');
    expect(source).toContain('listingsState.items.length === 0');
    expect(source).toContain('PulsingDots');
    expect(source).toContain('listingsError');
    expect(source).toContain('errorPresentation');
    expect(source).not.toContain('showAppendSkeleton');
  });

  it('keeps refresh failures separate from the empty-list failure state', () => {
    const source = readFileSync(
      join(marketSrc, 'market-page-panel.tsx'),
      'utf8'
    );

    expect(source).toContain("setListingsError('Couldn’t load listings.')");
    expect(source).toContain('failed: current.items.length === 0');
  });

  it('does not paint empty browse while wallet or catalog state is settling', () => {
    const source = readFileSync(
      join(marketSrc, 'market-page-panel.tsx'),
      'utf8'
    );

    expect(source).toContain('!walletLoading');
    expect(source).toContain('!catalogRefreshing');
    expect(source).toContain('ownedState.loaded');
    expect(source).not.toContain('showOwnedCheckSkeleton');
  });

  it('paints Yours from the vault page only — no early catalog-listed drip', () => {
    const source = readFileSync(
      join(marketSrc, 'market-page-panel.tsx'),
      'utf8'
    );

    expect(source).toContain('const owned = ownedState.items');
    expect(source).not.toContain('mergeOwnedYoursItems(');
    expect(source).toContain('catalogListedOwned');
    expect(source).toContain('showOwnedLoadingSeat');
  });

  it('keeps creator-shop listing-type chips out of the route loading shell', () => {
    const source = readFileSync(
      join(marketSrc, 'market-loading-screen.tsx'),
      'utf8'
    );

    expect(source).toContain('hideListingTypes={shopMode}');
    expect(source).toContain('marketCreatorShop(query.creator)');
  });
});
