import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const panel = readFileSync(join(here, 'collection-page-panel.tsx'), 'utf8');
const reader = readFileSync(
  join(here, 'scarce-writing-read-sheet.tsx'),
  'utf8'
);

describe('drop cover expand wiring', () => {
  it('routes the drop cover through collectionCoverExpandAction', () => {
    expect(panel).toContain('collectionCoverExpandAction');
    expect(panel).toContain('collectionOpensWritingReader');
    expect(panel).toContain("coverExpand === 'read'");
    expect(panel).toContain("coverExpand === 'listen'");
    expect(panel).toContain('collection-cover-read-hit');
    expect(panel).toContain('aria-label="Open reader"');
    expect(panel).toContain('aria-label="Open listen"');
    expect(panel).toContain('coverListenOpen');
    expect(panel).toContain('immersiveListen');
    expect(panel).not.toContain(
      'hasReadables || canShowPass || (!isAudio && Boolean(view.mediaUrl))'
    );
  });

  it('lets the reader jacket zoom art, not the drop cover', () => {
    expect(reader).toContain('DropArtOverlay');
    expect(reader).toContain('aria-label="View cover"');
    expect(reader).toContain('setCoverOpen(true)');
  });

  it('keeps the reader jacket + OS card portal (progress stays on quiet)', () => {
    expect(reader).toContain('OsSlideOverScreen');
    expect(reader).toContain('hideNav');
    expect(reader).toContain('scarce-writing-read-title');
    expect(reader).toContain('scarce-writing-read-progress');
    expect(reader).toContain('is-chrome-quiet');
    expect(reader).toContain('onScrollDelta');
    expect(reader).toContain('onChromeTap');
    expect(reader).not.toMatch(/^\s*viewport\s*$/m);
  });
});
