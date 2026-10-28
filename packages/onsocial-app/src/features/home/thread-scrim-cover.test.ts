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
const glassSheetSource = readFileSync(
  join(here, '../../../../onsocial-ui/src/glass-sheet.tsx'),
  'utf8'
);
const glassCss = readFileSync(
  join(here, '../../../../onsocial-ui/glass-sheet.css'),
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
  it('uses the band sheet instead of a private scrim and frost', () => {
    expect(sheetSource).toContain('sizing="band"');
    expect(sheetSource).toContain('SheetHeader');
    expect(sheetSource).not.toContain('feed-photo-thread-scrim');
    expect(sheetSource).not.toContain('feed-photo-thread-chrome');
    expect(glassSheetSource).toContain('glass-sheet-band-scrim');
    expect(glassSheetSource).toContain('var(--feed-thread-cover, 1)');
    expect(glassSheetSource).toContain('GLASS_SHEET_BACKDROP_BLUR_PX');
    expect(glassSheetSource).toContain('GLASS_SHEET_OS_PANEL_BLUR_PX');
  });

  it('keeps one frost opacity and no sheet shadow', () => {
    expect(globalsCss).toContain('--glass-sheet-frost-opacity: 0.56');
    expect(globalsCss).toContain('--glass-shadow: none');
    expect(glassCss).toContain(
      '--glass-sheet-body-opacity: var(--glass-sheet-frost-opacity, 0.56)'
    );
    expect(glassCss).toContain('box-shadow: var(--glass-shadow, none)');
    expect(glassCss).toContain('.glass-sheet-band-scrim');
    expect(glassCss).not.toContain('--glass-shadow: 0');
  });
});
