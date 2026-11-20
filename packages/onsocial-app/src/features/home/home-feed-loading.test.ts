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
    expect(source).toContain('onWindowRangeChange');
    expect(source).toContain('warmPostPanels');
    expect(source).toContain('quotedForPosts');
    expect(source).toContain('recordForPosts');
    expect(source).toContain("[data-feed-session=\"covered\"]");
  });
});
