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
