import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const homeSrc = dirname(fileURLToPath(import.meta.url));

describe('home feed loading contract', () => {
  it('derives presentation from the shared contract', () => {
    const source = readFileSync(join(homeSrc, 'home-feed.tsx'), 'utf8');

    expect(source).toContain('resolveAppLoadingPresentation');
    expect(source).toContain('showAppendSkeleton');
    expect(source).toContain('errorPresentation');
  });

  it('guards every async feed commit against stale generations', () => {
    const source = readFileSync(join(homeSrc, 'home-feed.tsx'), 'utf8');

    expect(source).toContain('isCurrentLoadingRequest');
    expect(source).not.toContain('loadIdRef.current !== loadId');
    expect(source).not.toContain('loadIdRef.current === loadId');
  });
});
