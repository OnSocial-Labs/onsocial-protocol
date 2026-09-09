import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appSrc = join(dirname(fileURLToPath(import.meta.url)), '..');

const sellHubSites = [
  'features/collectibles/collectibles-play-panel.tsx',
  'features/scarces/collection-owner-manage-menu.tsx',
  'features/scarces/hub-publish-requests-sheet.tsx',
  'features/scarces/app-page-panel.tsx',
] as const;

describe('sell / hub publish polish', () => {
  it('uses size="sm" on Sell, Manage, Approve, and hero Request', () => {
    for (const file of sellHubSites) {
      const source = readFileSync(join(appSrc, file), 'utf8');
      expect(source).toContain('size="sm"');
      expect(source).toContain('OsSheetActions');
    }
  });

  it('keeps Sell/Manage green as app surface ink, not a missing brand tone', () => {
    const css = readFileSync(join(appSrc, 'app/globals.css'), 'utf8');
    expect(css).toContain('collectibles-play-sell-action');
    expect(css).toContain('protocol-green');
    expect(css).not.toContain('tone="brand"');
    expect(css).not.toContain(
      'Sell / Manage green now comes from OsSheetAction tone="brand"'
    );
  });

  it('migrates hub hero Request onto OsSheetAction', () => {
    const source = readFileSync(
      join(appSrc, 'features/scarces/app-page-panel.tsx'),
      'utf8'
    );
    expect(source).toContain('hub-hero-publish-request');
    expect(source).toContain('OsSheetAction');
    expect(source).not.toMatch(
      /<button[\s\S]*className="hub-hero-publish-request"/
    );
  });
});
