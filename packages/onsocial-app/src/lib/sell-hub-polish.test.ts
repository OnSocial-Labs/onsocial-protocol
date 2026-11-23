import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appSrc = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('sell / hub publish polish', () => {
  it('uses size="sm" on hub Approve', () => {
    const source = readFileSync(
      join(appSrc, 'features/scarces/hub-publish-requests-sheet.tsx'),
      'utf8'
    );
    expect(source).toContain('size="sm"');
    expect(source).toContain('OsSheetActions');
  });

  it('opens holding Manage from the post-card ⋮, not a Sell pill', () => {
    const menu = readFileSync(
      join(appSrc, 'features/collectibles/collectibles-holding-row-menu.tsx'),
      'utf8'
    );
    expect(menu).toContain('post-card-menu-trigger');
    expect(menu).toContain('DotsVerticalIcon');
    expect(menu).not.toContain('collectibles-play-sell-action');
    expect(menu).not.toContain('OsSheetActions');
    expect(menu).not.toContain('trigger=');
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
