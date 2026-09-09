import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appSrc = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('os row action', () => {
  it('uses the borderless sm sheet action as the only row chip', () => {
    const source = readFileSync(join(appSrc, 'lib/os-row-action.tsx'), 'utf8');
    expect(source).toContain("osRowActionClassName = 'os-row-action'");
    expect(source).toContain('size="sm"');
    expect(source).toContain('borderless');
    expect(source).toContain('frosted-primary');
    expect(source).toContain('row-compact');
    expect(source).toContain('ReactNode');
  });

  it('wires row chips to OsRowAction', () => {
    const wiring = [
      'features/collectibles/collectibles-holding-row.tsx',
      'features/collectibles/collectibles-play-panel.tsx',
      'features/drops/drops-page-panel.tsx',
      'features/market/market-page-panel.tsx',
      'features/market/market-creator-drop-row.tsx',
      'features/scarces/series-shop-row.tsx',
      'features/scarces/collection-page-panel.tsx',
      'features/scarces/ticket-door-page-panel.tsx',
      'components/portfolio/page-drawer-collection.tsx',
    ] as const;
    for (const file of wiring) {
      expect(readFileSync(join(appSrc, file), 'utf8')).toContain('OsRowAction');
    }
  });

  it('drops leftover page-drawer-section-action pills', () => {
    const sites = [
      'features/collectibles/collectibles-holding-row.tsx',
      'features/collectibles/collectibles-play-panel.tsx',
      'features/drops/drops-page-panel.tsx',
      'features/market/market-page-panel.tsx',
      'features/scarces/series-shop-row.tsx',
      'features/scarces/collection-page-panel.tsx',
      'features/scarces/ticket-door-page-panel.tsx',
      'components/portfolio/page-drawer-collection.tsx',
    ] as const;
    for (const file of sites) {
      expect(readFileSync(join(appSrc, file), 'utf8')).not.toContain(
        'page-drawer-section-action'
      );
    }
    const css = readFileSync(join(appSrc, 'app/globals.css'), 'utf8');
    expect(css).not.toContain('.page-drawer-section-action {');
    expect(css).toContain('.os-row-action');
  });
});
