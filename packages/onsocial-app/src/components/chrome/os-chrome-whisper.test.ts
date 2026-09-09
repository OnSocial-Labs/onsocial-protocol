import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appSrc = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('os chrome whisper', () => {
  it('keeps live-list alerts on the fixed overlay contract', () => {
    const component = readFileSync(
      join(appSrc, 'components/chrome/os-chrome-whisper.tsx'),
      'utf8'
    );
    const globals = readFileSync(join(appSrc, 'app/globals.css'), 'utf8');

    expect(component).toContain('os-chrome-whisper-anchor');
    expect(component).toContain('os-chrome-whisper--alert');
    expect(component).toContain('os-chrome-whisper-copy');
    expect(component).toContain('os-chrome-whisper-retry');
    expect(component).toContain('OsChromeListAlert');
    expect(globals).toContain('.os-chrome-whisper-anchor');
    expect(globals).toContain('position: fixed');
    expect(globals).toContain('.os-chrome-whisper--alert');
    expect(globals).toContain('.os-chrome-whisper-retry');
  });

  it('overlays mid-list failures instead of blanking painted rows', () => {
    const surfaces = [
      'features/home/home-feed.tsx',
      'features/discover/discover-panel-content.tsx',
      'components/panels/standing-panel-content.tsx',
      'features/market/market-page-panel.tsx',
      'features/drops/drops-page-panel.tsx',
      'features/collectibles/collectibles-page-panel.tsx',
      'components/portfolio/page-drawer-store.tsx',
      'features/notifications/notifications-panel.tsx',
      'features/messages/messages-panel.tsx',
      'features/discover/discover-guilds-panel.tsx',
      'features/discover/discover-daos-panel.tsx',
      'features/discover/discover-hubs-panel.tsx',
      'features/guilds/live-guild-panel.tsx',
      'features/guilds/guild-members-roster.tsx',
    ] as const;

    for (const file of surfaces) {
      const source = readFileSync(join(appSrc, file), 'utf8');
      expect(source, file).toContain('OsChromeListAlert');
    }

    const drops = readFileSync(
      join(appSrc, 'features/drops/drops-page-panel.tsx'),
      'utf8'
    );
    expect(drops).toContain('failed && items.length === 0');
    expect(drops).toContain('failed && items.length > 0');
  });

  it('overlays the Messages sealed-thread hint instead of shoving bubbles', () => {
    const source = readFileSync(
      join(appSrc, 'features/messages/messages-panel.tsx'),
      'utf8'
    );
    const globals = readFileSync(join(appSrc, 'app/globals.css'), 'utf8');

    expect(source).toContain('OsChromeWhisper');
    expect(source).toContain('messages-sealed-hint');
    expect(source).toContain('Sealed before a key reset');
    expect(source).not.toContain('messages-sealed-banner');
    expect(globals).not.toContain('.messages-sealed-banner');
  });
});
