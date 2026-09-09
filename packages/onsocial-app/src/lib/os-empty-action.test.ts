import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appSrc = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('os empty action', () => {
  it('uses the borderless sm sheet action as the only empty CTA', () => {
    const source = readFileSync(
      join(appSrc, 'lib/os-empty-action.tsx'),
      'utf8'
    );
    expect(source).toContain("osEmptyActionClassName = 'os-empty-action'");
    expect(source).toContain('size="sm"');
    expect(source).toContain('borderless');
    expect(source).toContain('frosted-primary');
    expect(source).toContain('row-compact');
  });

  it('wires page empties to OsEmptyAction', () => {
    const wiring = [
      'features/market/market-page-panel.tsx',
      'features/collectibles/collectibles-page-panel.tsx',
      'features/collectibles/collectibles-play-panel.tsx',
      'features/scarces/collection-page-panel.tsx',
      'features/scarces/app-page-panel.tsx',
      'features/scarces/series-page-panel.tsx',
      'features/scarces/ticket-door-page-panel.tsx',
    ] as const;
    for (const file of wiring) {
      expect(readFileSync(join(appSrc, file), 'utf8')).toContain(
        'OsEmptyAction'
      );
    }
  });

  it('drops leftover empty pill classes from recoveries', () => {
    const recoveries = [
      'features/market/market-page-panel.tsx',
      'features/collectibles/collectibles-page-panel.tsx',
      'features/collectibles/collectibles-play-panel.tsx',
      'features/scarces/collection-page-panel.tsx',
      'features/scarces/app-page-panel.tsx',
      'features/scarces/series-page-panel.tsx',
      'features/scarces/ticket-door-page-panel.tsx',
    ] as const;
    for (const file of recoveries) {
      const source = readFileSync(join(appSrc, file), 'utf8');
      expect(source).not.toContain('app-soon-link');
      expect(source).not.toContain('MarketEmptyAction');
    }
    expect(readFileSync(join(appSrc, 'app/globals.css'), 'utf8')).not.toContain(
      '.app-soon-link'
    );
  });
});
