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

  it('personal + guild + quotes share useFeedWindow + anchor queries', () => {
    for (const file of [
      'live-personal-post-panel.tsx',
      '../guilds/live-guild-post-panel.tsx',
      'post-quotes-panel.tsx',
    ]) {
      const source = readFileSync(join(here, file), 'utf8');
      expect(source).toContain('useFeedWindow');
      expect(source).toMatch(/anchorQuery:\s*(THREAD_ANCHOR_QUERY|SECONDARY_ANCHOR_QUERY)/);
    }
    const guildFeed = readFileSync(
      join(here, '../guilds/live-guild-panel.tsx'),
      'utf8'
    );
    expect(guildFeed).toContain('useFeedWindow');
    expect(guildFeed).toContain('data-feed-key={key}');
    expect(guildFeed).toContain('feedBlockEstimatePx');
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

  it('deep-link focus waits for land then releases the seat guard before scroll', () => {
    const focus = readFileSync(
      join(here, '../../hooks/use-thread-focus-reply.ts'),
      'utf8'
    );
    expect(focus).toContain('releaseLandSeatGuard');
    expect(focus).toContain('releaseLandSeatGuardRef.current?.()');
    for (const file of [
      'live-personal-post-panel.tsx',
      '../guilds/live-guild-post-panel.tsx',
    ]) {
      const source = readFileSync(join(here, file), 'utf8');
      expect(source).toContain('landSettled');
      expect(source).toContain("loadState === 'ready' && landSettled");
      expect(source).toContain('releaseLandSeatGuard: releaseSeatGuard');
      // Permalink waits on the first reply page; feed-row seeds land with OP.
      expect(source).toContain('tailReady: rootFromFeed || repliesResolved');
      expect(source).toContain('isFeedRowSeed(initial)');
      expect(source).toContain('rootFromFeed,');
    }
  });

  it('under-header land keeps a seat guard for ancestor soft-fill', () => {
    const land = readFileSync(
      join(here, '../../hooks/use-land-opened-post.ts'),
      'utf8'
    );
    expect(land).toContain('THREAD_LAND_SEAT_GUARD_MS');
    expect(land).toContain('MutationObserver');
    expect(land).toContain('holdAgainstAboveResize');
    expect(land).toContain('openedPostPinDeficit');
    // Observers must end with the guard — not linger on parked trail sheets.
    expect(land).toContain('window.setTimeout(release, lastGuard + 32)');
    expect(land).toContain('if (!parked) return');
  });

  it('empty-thread More from keeps a tail seat through share settle', () => {
    for (const file of [
      'live-personal-post-panel.tsx',
      '../guilds/live-guild-post-panel.tsx',
    ]) {
      const source = readFileSync(join(here, file), 'utf8');
      // Reply skeleton until the first page; peek only when confirmed empty.
      expect(source).toContain('!repliesResolved');
      expect(source).toContain('PostRowSkeleton rows={2}');
      expect(source).toContain('armed={emptyTailReady}');
      expect(source).toContain('ThreadDiscoverPeek');
      expect(source).toContain('allowEmptyCollapse={landSettled}');
    }
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
