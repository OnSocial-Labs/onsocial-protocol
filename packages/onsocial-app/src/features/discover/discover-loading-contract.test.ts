import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const discoverSrc = dirname(fileURLToPath(import.meta.url));

describe('discover loading contract', () => {
  it('derives cold, refresh, append, and error presentation from the shared contract', () => {
    const source = readFileSync(
      join(discoverSrc, 'discover-panel-content.tsx'),
      'utf8'
    );

    expect(source).toContain('resolveAppLoadingPresentation');
    expect(source).toContain('showProfilesSkeleton');
    expect(source).toContain('showListRefreshing');
    expect(source).toContain('showAppendPending');
    expect(source).toContain("loadingPresentation === 'append-pending'");
    expect(source).toContain('errorPresentation');
    expect(source).not.toContain('showAppendSkeleton');
  });

  it('does not replace painted Discover rows with a cold skeleton', () => {
    const source = readFileSync(
      join(discoverSrc, '../../hooks/use-discover-profiles.ts'),
      'utf8'
    );

    expect(source).toContain('!hasListRows');
    expect(source).toContain('setLoadError(message)');
  });

  it('does not stack a route settle cover on Discover page (loading.tsx owns it)', () => {
    const source = readFileSync(
      join(discoverSrc, 'discover-page-panel.tsx'),
      'utf8'
    );
    expect(source).not.toContain('os-route-settle');
    expect(source).not.toContain('settleMoving');
    expect(source).not.toContain('DiscoverMovingLandingSkeleton');
    expect(source).toContain('DiscoverPanelContent');
  });

  it('route Suspense never blanks — same chrome skeleton as loading.tsx', () => {
    const loading = readFileSync(
      join(discoverSrc, '../../app/(app)/discover/loading.tsx'),
      'utf8'
    );
    const page = readFileSync(
      join(discoverSrc, '../../app/(app)/discover/page.tsx'),
      'utf8'
    );
    expect(loading).toContain('DiscoverLoadingScreen');
    expect(loading).not.toContain('fallback={null}');
    expect(page).toContain('DiscoverLoadingScreen');
    expect(page).not.toContain('fallback={null}');
  });

  it('appends hubs/guilds/DAOs with footer dots, not mid-list skeletons', () => {
    for (const file of [
      'discover-hubs-panel.tsx',
      'discover-guilds-panel.tsx',
      'discover-daos-panel.tsx',
    ] as const) {
      const source = readFileSync(join(discoverSrc, file), 'utf8');
      expect(source).toContain('list-append-pending');
      expect(source).toContain('PulsingDots');
      // Cold load may still use DiscoverCommunityListSkeleton; append must not.
      expect(source).not.toContain('Loading more hubs');
      expect(source).not.toContain('Loading more guilds');
      expect(source).not.toContain('Loading more DAOs');
      expect(source).not.toMatch(
        /DiscoverCommunityListSkeleton\s*\n?\s*label="Loading more/
      );
    }
  });
});
