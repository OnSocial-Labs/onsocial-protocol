import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { osAppChromePageClassName } from '@onsocial/ui';
import {
  COLLECTION_PAGE_SKELETON_CLASS,
  DOOR_PAGE_CLASS,
  DROPS_INDEX_PAGE_CLASS,
  DROP_STUDIO_PAGE_CLASS,
  GUILDS_PAGE_CLASS,
  HUB_PAGE_SKELETON_CLASS,
  LAUNCHER_HOME_PAGE_CLASS,
  MARKET_INDEX_PAGE_CLASS,
  MARKET_PAGE_CLASS,
  PLAY_LOADING_PAGE_CLASS,
  VAULT_PAGE_CLASS,
  osChromePageClassName,
} from '@/lib/os-chrome-page';

const appSrc = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('os chrome page', () => {
  it('uses the UI chrome page class as the only inset root', () => {
    expect(osChromePageClassName('launcher-home')).toBe(
      `${osAppChromePageClassName} launcher-home`
    );
    expect(osAppChromePageClassName).toBe('os-app-chrome-page');
  });

  it('puts every index on the chrome page inset', () => {
    expect(LAUNCHER_HOME_PAGE_CLASS).toBe(
      `${osAppChromePageClassName} launcher-home`
    );
    expect(DROPS_INDEX_PAGE_CLASS).toBe(
      `${osAppChromePageClassName} market-page-body drops-page-body`
    );
    expect(MARKET_PAGE_CLASS).toBe(`${osAppChromePageClassName} market-page`);
    expect(MARKET_INDEX_PAGE_CLASS).toBe(MARKET_PAGE_CLASS);
    expect(VAULT_PAGE_CLASS).toBe(
      `${osAppChromePageClassName} market-page collectibles-page`
    );
    expect(DOOR_PAGE_CLASS).toBe(
      `${osAppChromePageClassName} market-page ticket-door-page`
    );
    expect(PLAY_LOADING_PAGE_CLASS).toBe(
      `${osAppChromePageClassName} market-page collectibles-play-page is-immersive`
    );
    expect(GUILDS_PAGE_CLASS).toBe(`${osAppChromePageClassName} guilds-page`);
    expect(DROP_STUDIO_PAGE_CLASS).toBe(
      `${osAppChromePageClassName} drop-studio`
    );
    expect(HUB_PAGE_SKELETON_CLASS).toContain('app-page');
    expect(COLLECTION_PAGE_SKELETON_CLASS).toContain('collection-page');
  });

  it('puts detail roots on the chrome page inset', () => {
    expect(osChromePageClassName('app-page', 'is-use-first')).toBe(
      `${osAppChromePageClassName} app-page is-use-first`
    );
    expect(osChromePageClassName('collection-page', false)).toBe(
      `${osAppChromePageClassName} collection-page`
    );
  });

  it('wires index panels to the shared page classes', () => {
    const wiring = [
      ['features/guilds/live-guilds-index-panel.tsx', 'LAUNCHER_HOME_PAGE_CLASS'],
      ['features/scarces/hubs-index-panel.tsx', 'LAUNCHER_HOME_PAGE_CLASS'],
      ['features/protocol/daos-index-panel.tsx', 'LAUNCHER_HOME_PAGE_CLASS'],
      ['features/drops/drops-page-panel.tsx', 'DROPS_INDEX_PAGE_CLASS'],
      ['features/drops/drops-loading-screen.tsx', 'DROPS_INDEX_PAGE_CLASS'],
      ['features/market/market-page-panel.tsx', 'MARKET_INDEX_PAGE_CLASS'],
      ['features/market/market-loading-screen.tsx', 'MARKET_INDEX_PAGE_CLASS'],
      ['features/guilds/live-guild-panel.tsx', 'GUILDS_PAGE_CLASS'],
      ['features/guilds/live-guild-post-panel.tsx', 'GUILDS_PAGE_CLASS'],
      ['features/home/live-personal-post-panel.tsx', 'GUILDS_PAGE_CLASS'],
      ['features/home/post-quotes-panel.tsx', 'GUILDS_PAGE_CLASS'],
      ['features/scarces/app-page-panel.tsx', 'osChromePageClassName'],
      ['features/scarces/collection-page-panel.tsx', 'osChromePageClassName'],
      ['features/scarces/hub-page-skeleton.tsx', 'HUB_PAGE_SKELETON_CLASS'],
      [
        'features/scarces/collection-page-skeleton.tsx',
        'COLLECTION_PAGE_SKELETON_CLASS',
      ],
      ['features/scarces/create-drop-panel.tsx', 'DROP_STUDIO_PAGE_CLASS'],
      ['features/collectibles/collectibles-page-panel.tsx', 'VAULT_PAGE_CLASS'],
      [
        'features/collectibles/collectibles-loading-screen.tsx',
        'VAULT_PAGE_CLASS',
      ],
      [
        'features/collectibles/collectibles-play-panel.tsx',
        'osChromePageClassName',
      ],
      [
        'features/collectibles/collectibles-play-loading-screen.tsx',
        'PLAY_LOADING_PAGE_CLASS',
      ],
      ['features/scarces/ticket-door-page-panel.tsx', 'DOOR_PAGE_CLASS'],
      ['features/scarces/collection-route-loading.tsx', 'DOOR_PAGE_CLASS'],
      ['features/scarces/series-page-panel.tsx', 'MARKET_PAGE_CLASS'],
      ['features/scarces/series-route-loading.tsx', 'MARKET_PAGE_CLASS'],
      ['features/scarces/app-page-panel.tsx', 'MARKET_PAGE_CLASS'],
      ['features/scarces/collection-page-panel.tsx', 'MARKET_PAGE_CLASS'],
    ] as const;
    for (const [file, token] of wiring) {
      expect(readFileSync(join(appSrc, file), 'utf8')).toContain(token);
    }
  });

  it('drops the leftover market-page padding allowlist', () => {
    const globals = readFileSync(join(appSrc, 'app/globals.css'), 'utf8');
    expect(globals).not.toContain('.market-page:not(.os-app-chrome-page)');
  });
});
