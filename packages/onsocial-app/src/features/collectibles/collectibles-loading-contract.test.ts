import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const collectiblesSrc = dirname(fileURLToPath(import.meta.url));

describe('collectibles loading contract', () => {
  it('derives cold, refresh, append, and error presentation from the shared contract', () => {
    const source = readFileSync(
      join(collectiblesSrc, 'collectibles-page-panel.tsx'),
      'utf8'
    );

    expect(source).toContain('resolveAppLoadingPresentation');
    expect(source).toContain('loadingPresentation');
    expect(source).toContain('showVaultSkeleton');
    expect(source).toContain('showRefreshOverlay');
    expect(source).toContain('showStateError');
  });

  it('keeps painted vault rows during refresh and appends distinct skeleton rows', () => {
    const source = readFileSync(
      join(collectiblesSrc, 'collectibles-page-panel.tsx'),
      'utf8'
    );
    const skeletonSource = readFileSync(
      join(collectiblesSrc, 'collectibles-library-skeleton.tsx'),
      'utf8'
    );

    expect(source).toContain("hasPaintedRows ? 'refreshing' : 'cold'");
    expect(source).toContain("loadingPresentation === 'preserve'");
    expect(source).toContain('CollectiblesLibraryAppendSkeleton');
    expect(source).toContain("loadingPresentation === 'append-skeleton'");
    expect(source).toContain('refreshing={loadingPresentation ===');
    expect(skeletonSource).toContain(
      'data-collectibles-library-append-skeleton'
    );
    expect(skeletonSource).toContain('collectibles-holding-row--skeleton');
    expect(skeletonSource).not.toContain(
      'collectibles-holding-row collectibles-holding-row--skeleton'
    );
  });

  it('uses the same query-aware vault shell for route loading', () => {
    const loadingSource = readFileSync(
      join(collectiblesSrc, 'collectibles-loading-screen.tsx'),
      'utf8'
    );

    expect(loadingSource).toContain('CollectiblesLibrarySkeleton');
    expect(loadingSource).toContain('CollectiblesFilterToolbar');
    expect(loadingSource).toContain('data-collectibles-loading-screen');
    expect(loadingSource).toContain('VAULT_PAGE_CLASS');
  });
});
