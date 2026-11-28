import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const homeSrc = dirname(fileURLToPath(import.meta.url));

describe('home feed loading contract', () => {
  it('derives presentation from the shared contract', () => {
    const source = readFileSync(join(homeSrc, 'home-feed.tsx'), 'utf8');

    expect(source).toContain('resolveAppLoadingPresentation');
    expect(source).toContain('showAppendPending');
    expect(source).toContain("loadingPresentation === 'append-pending'");
    expect(source).toContain('PulsingDots');
    expect(source).toContain('errorPresentation');
    expect(source).not.toContain('showAppendSkeleton');
    expect(source).not.toContain('HOME_FEED_APPEND_SKELETON_FRAMES');
  });

  it('guards every async feed commit against stale generations', () => {
    const source = readFileSync(join(homeSrc, 'home-feed.tsx'), 'utf8');

    expect(source).toContain('peekHomeFeedSession');
    expect(source).toContain('writeHomeFeedSession');
    expect(source).toContain('homeFeedSessionProbeDelayMs');
    expect(source).toContain('isCurrentLoadingRequest');
    expect(source).toContain('canStartHomeFeedAppend');
    expect(source).toContain('canRunHomeFeedReconcile');
    expect(source).toContain('mergeHomeFeedHead');
    expect(source).toContain('growFeedWindow');
    expect(source).not.toContain('loadIdRef.current !== loadId');
    expect(source).not.toContain('loadIdRef.current === loadId');
  });

  it('does not head-trim on load-more; projects seeds; skips covered underlay scroll', () => {
    const source = readFileSync(join(homeSrc, 'home-feed.tsx'), 'utf8');

    // Append keeps the accumulated list — head trim orphaned scroll-up order.
    expect(source).not.toContain('trimHomeFeedWorkingSet(');
    expect(source).toContain('trimHomeFeedWorkingSetKeepingHead');
    expect(source).toContain('planHomeFeedMemoryTrim');
    expect(source).toContain('homeFeedMemoryTrimNeedsScrollAnchor');
    expect(source).toContain('holdFeedScrollAnchor');
    expect(source).toContain('feedListMutationNeedsScrollAnchor');
    expect(source).toContain('scrollAnchorKey');
    expect(source).toContain('onWindowRangeChange');
    expect(source).toContain('scheduleMemoryTrim');
    // Lenis scroll events are untrusted — trim must still schedule.
    expect(source).not.toContain('if (!event.isTrusted) return');
    expect(source).toContain('warmFeedOpenChunks');
    expect(source).not.toContain('warmFeedOpenChunksIdle');
    expect(source).toContain('quotedForPosts');
    expect(source).toContain('recordForPosts');
    expect(source).toContain("[data-feed-session=\"covered\"]");
  });

  it('windowed lists restore height via feed anchors only (no dual Lenis shift)', () => {
    const windowSrc = readFileSync(join(homeSrc, 'use-feed-window.ts'), 'utf8');
    expect(windowSrc).toContain('restoreFeedAnchor');
    expect(windowSrc).toContain('pendingMeasureAnchorRef');
    expect(windowSrc).toContain('Do not also Lenis-shift here');
    expect(windowSrc).not.toContain('shiftAppLenisScroll');

    const listSrc = readFileSync(join(homeSrc, 'personal-feed-list.tsx'), 'utf8');
    expect(listSrc).toContain('useStableFeedBlockKeys');
    expect(listSrc).toContain("'data-feed-window'");
    const mediaSrc = readFileSync(join(homeSrc, 'post-media.tsx'), 'utf8');
    expect(mediaSrc).toContain("querySelector('[data-feed-window]')");
    expect(mediaSrc).not.toContain(
      "querySelector('[data-feed-window-spacer]')"
    );
  });

  it('holds scroll when standing peeks arrive and on every coalesce-capable append', () => {
    const source = readFileSync(join(homeSrc, 'home-feed.tsx'), 'utf8');
    expect(source).toContain('standingArriving');
    expect(source).toContain('assignStableFeedBlockKeys');
    expect(source).toContain('onBlockKeyState');
    expect(source).toContain('reRankAnchorMissRef');
  });

  it('soft-fills scarce embeds once per page (soft refresh + append)', () => {
    const source = readFileSync(join(homeSrc, 'home-feed.tsx'), 'utf8');
    expect(source).toContain('hydrateScarceEmbedsForPosts');
    expect(source).toContain('seedScarceEmbedsFromSsr(appendedScarce');
    expect(source).toContain('seedScarceEmbedsFromSsr(scarce, { notify: true })');
    // Quotes side-paint must not double-hydrate scarce on the same items.
    const fillStart = source.indexOf('const fillSidePaint');
    const fillEnd = source.indexOf('const releaseColdLoad');
    expect(fillStart).toBeGreaterThan(-1);
    expect(fillEnd).toBeGreaterThan(fillStart);
    expect(source.slice(fillStart, fillEnd)).not.toContain(
      'hydrateScarceEmbedsForPosts'
    );
  });

  it('soft-refresh and appear panels share the 280ms ease-out token', () => {
    const css = readFileSync(join(homeSrc, '../../app/globals.css'), 'utf8');
    const softRefresh = css.slice(
      css.indexOf('.home-feed-list.is-refreshing'),
      css.indexOf('.home-feed-list.is-refreshing') + 280
    );
    expect(softRefresh).toContain('var(--os-motion-appear, 280ms)');
    expect(softRefresh).toContain('var(--os-motion-ease-out');
    expect(softRefresh).not.toContain('160ms ease');

    const savedRefresh = css.slice(
      css.indexOf('.home-saved-feed-sheet-list.is-refreshing'),
      css.indexOf('.home-saved-feed-sheet-list.is-refreshing') + 280
    );
    expect(savedRefresh).toContain('var(--os-motion-appear, 280ms)');
    expect(savedRefresh).toContain('var(--os-motion-ease-out');
    expect(savedRefresh).not.toContain('160ms ease');

    const sheet = readFileSync(
      join(homeSrc, '../../../../onsocial-ui/glass-sheet.css'),
      'utf8'
    );
    const appear = sheet.slice(
      sheet.indexOf(".glass-sheet-panel[data-presentation='appear'] {"),
      sheet.indexOf(
        ".glass-sheet-panel[data-presentation='appear'].is-open.glass-sheet-panel--enter"
      ) + 220
    );
    expect(appear).toContain('var(--os-motion-ease-out');
    expect(appear).not.toContain('var(--os-motion-ease-standard');
  });
});
