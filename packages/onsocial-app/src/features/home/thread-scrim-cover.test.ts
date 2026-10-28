import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FEED_THREAD_PEEK, threadScrimCover } from './use-feed-thread-band';

const here = dirname(fileURLToPath(import.meta.url));
const sheetSource = readFileSync(
  join(here, 'feed-media-thread-sheet.tsx'),
  'utf8'
);
const globalsCss = readFileSync(join(here, '../../app/globals.css'), 'utf8');

describe('threadScrimCover', () => {
  it('stays fully covered at peek and above so the open fade does not grow the blur', () => {
    expect(threadScrimCover(FEED_THREAD_PEEK)).toBe(1);
    expect(threadScrimCover(0.9)).toBe(1);
    expect(threadScrimCover(1)).toBe(1);
  });

  it('scales with coverage only while the band is below peek', () => {
    expect(threadScrimCover(0)).toBe(0);
    expect(threadScrimCover(-0.2)).toBe(0);
    expect(threadScrimCover(FEED_THREAD_PEEK / 2)).toBeCloseTo(0.5);
  });
});

describe('reply drawer blur stack', () => {
  it('mounts the 16px scrim and 12px frost from the shared glass constants', () => {
    expect(sheetSource).toContain('GLASS_SHEET_BACKDROP_BLUR_PX');
    expect(sheetSource).toContain('GLASS_SHEET_BACKDROP_SATURATE');
    expect(sheetSource).toContain('GLASS_SHEET_OS_PANEL_BLUR_PX');
    expect(sheetSource).toContain('GLASS_SHEET_PANEL_SATURATE');
    expect(sheetSource).toContain('var(--feed-thread-cover, 1)');
    expect(sheetSource).toContain('glass-sheet-header');
    expect(sheetSource).not.toContain('feed-photo-thread-chrome');
  });

  it('clips the scrim to the pane and fills both layers at 56 percent', () => {
    expect(globalsCss).toContain('.feed-photo-thread-scrim');
    expect(globalsCss).toContain('background: rgb(var(--bg-rgb) / 0.56)');
    expect(globalsCss).toContain('--glass-sheet-body-opacity: 0.56');
    expect(globalsCss).toMatch(
      /\.feed-photo-thread-sheet \{[\s\S]*?background: transparent/
    );
  });
});
