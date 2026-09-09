import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appSrc = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('os load more', () => {
  it('uses the ghost sm sheet action as the only Show more control', () => {
    const source = readFileSync(join(appSrc, 'lib/os-load-more.tsx'), 'utf8');
    expect(source).toContain("osLoadMoreClassName = 'os-load-more'");
    expect(source).toContain('variant="ghost"');
    expect(source).toContain('size="sm"');
    expect(source).toContain('borderless');
    expect(source).toContain('OsSheetAction');
  });

  it('wires catalog and feed load-more to OsLoadMore', () => {
    const wiring = [
      'features/market/market-page-panel.tsx',
      'features/drops/drops-page-panel.tsx',
      'features/collectibles/collectibles-page-panel.tsx',
      'components/portfolio/page-drawer-store.tsx',
      'features/protocol/dao-workspace-panel.tsx',
      'features/protocol/dao-discover-sheet.tsx',
      'features/home/live-personal-post-panel.tsx',
      'features/home/post-quotes-panel.tsx',
      'features/guilds/live-guild-post-panel.tsx',
    ] as const;
    for (const file of wiring) {
      expect(readFileSync(join(appSrc, file), 'utf8')).toContain('OsLoadMore');
    }
  });

  it('drops leftover Show more class names', () => {
    const sites = [
      'features/market/market-page-panel.tsx',
      'features/drops/drops-page-panel.tsx',
      'features/collectibles/collectibles-page-panel.tsx',
      'components/portfolio/page-drawer-store.tsx',
      'features/protocol/dao-workspace-panel.tsx',
      'features/protocol/dao-discover-sheet.tsx',
    ] as const;
    for (const file of sites) {
      const source = readFileSync(join(appSrc, file), 'utf8');
      expect(source).not.toContain('market-sales-more');
      expect(source).not.toContain('protocol-feed-more');
      expect(source).not.toContain('daos-discover-more');
    }
    const css = readFileSync(join(appSrc, 'app/globals.css'), 'utf8');
    expect(css).not.toContain('.market-sales-more {');
    expect(css).not.toContain('.protocol-feed-more {');
    expect(css).not.toContain('.daos-discover-more {');
  });
});
