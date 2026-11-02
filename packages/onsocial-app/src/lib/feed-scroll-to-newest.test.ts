import { describe, expect, it, vi } from 'vitest';
import { registerAppLenis, unregisterAppLenis } from './app-lenis-registry';
import {
  FEED_CATCH_UP_SCROLLING_CLASS,
  FEED_SCROLL_TO_NEWEST_MAX_MS,
  FEED_SCROLL_TO_NEWEST_MIN_MS,
  feedScrollToNewestDurationMs,
  scrollFeedToNewest,
  shouldAnimateFeedScrollToNewest,
} from './feed-scroll-to-newest';

describe('shouldAnimateFeedScrollToNewest', () => {
  it('skips when already at the top or motion is reduced', () => {
    expect(shouldAnimateFeedScrollToNewest(0)).toBe(false);
    expect(shouldAnimateFeedScrollToNewest(8)).toBe(false);
    expect(shouldAnimateFeedScrollToNewest(120, true)).toBe(false);
  });

  it('animates from any depth past the top epsilon', () => {
    expect(shouldAnimateFeedScrollToNewest(200)).toBe(true);
    expect(shouldAnimateFeedScrollToNewest(2400)).toBe(true);
  });
});

describe('feedScrollToNewestDurationMs', () => {
  it('scales with travel and clamps', () => {
    expect(feedScrollToNewestDurationMs(100, 800)).toBe(
      FEED_SCROLL_TO_NEWEST_MIN_MS
    );
    expect(feedScrollToNewestDurationMs(1600, 800)).toBe(520);
    expect(feedScrollToNewestDurationMs(8000, 800)).toBe(
      FEED_SCROLL_TO_NEWEST_MAX_MS
    );
  });
});

describe('scrollFeedToNewest', () => {
  it('uses distance-scaled Lenis duration and marks the root', () => {
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
    });
    const root = {
      scrollTop: 1600,
      clientHeight: 800,
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
      },
    } as unknown as HTMLElement;
    const scrollTo = vi.fn(
      (_target: number, options?: { onComplete?: () => void }) => {
        options?.onComplete?.();
      }
    );
    registerAppLenis(root, {
      limit: 4000,
      scroll: 1600,
      resize() {},
      scrollTo,
    });
    const onComplete = vi.fn();
    scrollFeedToNewest(root, { onComplete });
    unregisterAppLenis(root);
    vi.unstubAllGlobals();
    expect(root.classList.add).toHaveBeenCalledWith(
      FEED_CATCH_UP_SCROLLING_CLASS
    );
    expect(scrollTo).toHaveBeenCalledWith(
      0,
      expect.objectContaining({
        force: true,
        duration: 0.52,
      })
    );
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
