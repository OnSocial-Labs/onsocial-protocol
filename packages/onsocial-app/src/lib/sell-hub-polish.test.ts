import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appSrc = join(dirname(fileURLToPath(import.meta.url)), '..');

const sellHubSites = [
  'features/collectibles/collectibles-holding-row-menu.tsx',
  'features/scarces/hub-publish-requests-sheet.tsx',
] as const;

describe('sell / hub publish polish', () => {
  it('uses size="sm" on Manage and Approve', () => {
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

  it('asks to publish from the hero plus, beside the gear', () => {
    const actions = readFileSync(
      join(appSrc, 'features/scarces/hub-hero-actions.tsx'),
      'utf8'
    );
    expect(actions).toContain('Request to publish');
    expect(actions).toContain('UserPlusIcon');
    expect(actions).toContain('guild-hero-action-icon');
    const panel = readFileSync(
      join(appSrc, 'features/scarces/app-page-panel.tsx'),
      'utf8'
    );
    expect(panel).toContain('HubHeroActions');
    expect(panel).toContain('guild-hero-meta-end');
    expect(panel).not.toContain('hub-hero-publish-request');
    expect(panel).not.toContain('guild-manage-menu-trigger');
  });
});
