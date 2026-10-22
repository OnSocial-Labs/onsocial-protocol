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
  it('opens the larger cover from the picture and keeps Read and Play labeled', () => {
    expect(panel).toContain('collectionCoverExpandAction');
    expect(panel).toContain("coverExpand === 'artwork'");
    expect(panel).toContain('View full cover');
    expect(panel).toContain('setMediaOverlayOpen(true)');
    expect(panel).toContain('collectionOpensWritingReader');
    expect(panel).toContain('openWritingRead');
    expect(panel).toContain('>Read</OsRowAction>');
    expect(panel).toContain('setCoverListenOpen(true)');
    expect(panel).toContain('collectiblesPlayPath');
    expect(panel).not.toContain('collectionCoverArtChip');
    expect(panel).not.toContain('ScaleUpIcon');
    expect(panel).not.toContain("'Open reader'");
    expect(panel).not.toContain("'Open listen'");
    expect(panel).not.toContain('listenOnCover');
    expect(panel).toContain('coverListenOpen');
    expect(panel).toContain('immersiveListen');
  });

  it('yields the route SSR skeleton to loading.tsx', () => {
    expect(panel).toContain('collectionRouteYieldsLoadingSkeleton');
  });

  it('lets the reader jacket zoom art, not the drop cover', () => {
    expect(reader).toContain('DropArtOverlay');
    expect(reader).toContain('onOpenCover');
    expect(reader).toContain('setCoverOpen(true)');
    expect(reader).toContain('portfolio-writing-article-spread');
    expect(reader).toContain('writingReaderKindLabel');
    expect(reader).toContain('aria-label="View cover"');
    expect(reader).not.toContain('onViewCover');
  });

  it('opens the book in the article reader, still portaled to the OS card', () => {
    expect(reader).toContain('OsSlideOverScreen');
    expect(reader).toContain('ARTICLE_READ_CLASS');
    expect(reader).toContain('ArticleReadProgress');
    expect(reader).toContain('gestures={false}');
    expect(reader).toContain('onChromeTap={onChromeTap}');
    expect(reader).not.toContain('compactChrome');
    expect(reader).not.toContain('WritingReaderMenu');
    expect(reader).not.toMatch(/^\s*viewport\s*$/m);
  });

  it('locks the writing reader column to a 1rem pad', () => {
    const css = readFileSync(join(here, '../../app/globals.css'), 'utf8');
    expect(css).toMatch(
      /\.scarce-read-slide \.scarce-writing-read,[\s\S]*?padding: 0 1rem 0\.55rem;/
    );
  });
});
