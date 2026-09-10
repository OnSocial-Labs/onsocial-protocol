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
    expect(source).toContain('showAppendSkeleton');
    expect(source).toContain('errorPresentation');
  });

  it('does not replace painted Discover rows with a cold skeleton', () => {
    const source = readFileSync(
      join(discoverSrc, '../../hooks/use-discover-profiles.ts'),
      'utf8'
    );

    expect(source).toContain('!hasListRows');
    expect(source).toContain('setLoadError(message)');
  });
});
