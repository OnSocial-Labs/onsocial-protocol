import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { osAppChromePageClassName } from '@onsocial/ui';
import {
  DROPS_INDEX_PAGE_CLASS,
  LAUNCHER_HOME_PAGE_CLASS,
  MARKET_INDEX_PAGE_CLASS,
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
    expect(MARKET_INDEX_PAGE_CLASS).toBe(
      `${osAppChromePageClassName} market-page`
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
    ] as const;
    for (const [file, token] of wiring) {
      expect(readFileSync(join(appSrc, file), 'utf8')).toContain(token);
    }
  });
});
