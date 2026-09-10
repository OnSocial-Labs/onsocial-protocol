import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dropsSrc = dirname(fileURLToPath(import.meta.url));

describe('drops loading contract', () => {
  it('derives cold, refresh, append, and error presentation from the shared contract', () => {
    const source = readFileSync(join(dropsSrc, 'drops-page-panel.tsx'), 'utf8');

    expect(source).toContain('resolveAppLoadingPresentation');
    expect(source).toContain('showCatalogSkeleton');
    expect(source).toContain('catalogRefreshing');
    expect(source).toContain('showAppendSkeleton');
    expect(source).toContain('errorPresentation');
  });

  it('renders append skeleton rows without replacing painted drops', () => {
    const source = readFileSync(join(dropsSrc, 'drops-page-panel.tsx'), 'utf8');

    expect(source).toContain(
      "resolveAppLoadingPresentation(hasPaintedRows ? 'appending' : 'cold'"
    );
    expect(source).toContain(
      '{showAppendSkeleton ? <MarketListSkeleton rows={2} /> : null}'
    );
    expect(source).toContain("failed && errorPresentation === 'overlay'");
  });
});
