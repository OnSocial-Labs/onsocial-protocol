import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('post thread harden contracts', () => {
  it('personal + guild folds carry scroll anchors and window height caches', () => {
    for (const file of [
      'live-personal-post-panel.tsx',
      '../guilds/live-guild-post-panel.tsx',
    ]) {
      const source = readFileSync(join(here, file), 'utf8');
      expect(source).toContain('data-thread-focus-key={foldKey}');
      expect(source).toContain('threadWindowSizeCache');
      expect(source).toContain('revealRow: revealReplyRow');
      expect(source).toContain('replyListRows: ReactNode[]');
      expect(source).not.toContain(
        'replyListRows.slice(replyWindowStart, replyWindowEnd)'
      );
    }
  });

  it('personal + quotes load-more use an in-flight ref', () => {
    const personal = readFileSync(
      join(here, 'live-personal-post-panel.tsx'),
      'utf8'
    );
    const quotes = readFileSync(join(here, 'post-quotes-panel.tsx'), 'utf8');
    expect(personal).toContain('loadMoreInFlightRef');
    expect(quotes).toContain('loadMoreInFlightRef');
  });

  it('focus uses window reveal + instant scrollIntoView', () => {
    const focus = readFileSync(
      join(here, '../../hooks/use-thread-focus-reply.ts'),
      'utf8'
    );
    expect(focus).toContain('revealRowRef.current?.(rowKey)');
    expect(focus).toContain("behavior: 'auto'");
    expect(focus).not.toContain("behavior: 'smooth'");
  });

  it('captures underlay scroll with Lenis-aware top', () => {
    const layer = readFileSync(join(here, 'post-thread-layer.tsx'), 'utf8');
    expect(layer).toContain('readAppScrollTop');
    expect(layer).toContain('restoreUnderlayScroll');
  });

  it('media-face thread sheet routes guild roots to LiveGuildPostPanel', () => {
    const sheet = readFileSync(
      join(here, 'feed-media-thread-sheet.tsx'),
      'utf8'
    );
    expect(sheet).toContain('LiveGuildPostPanel');
    expect(sheet).toContain('hideRootMedia');
    expect(sheet).toContain('landSeat={false}');
    expect(sheet).toContain('seedEmbeddedGuildThread');
  });
});
