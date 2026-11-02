import { getAppLenis } from '@/lib/app-lenis-registry';
import { prefersReducedMotion } from '@/lib/app-smooth-scroll';

/** Already at the head — don't animate a no-op. */
export const FEED_SCROLL_AT_TOP_PX = 8;

/** Floor / ceiling for distance-scaled catch-up motion (ms). */
export const FEED_SCROLL_TO_NEWEST_MIN_MS = 320;
export const FEED_SCROLL_TO_NEWEST_MAX_MS = 700;

/** ~ms per viewport of travel — deep feeds take longer so it reads as scroll. */
export const FEED_SCROLL_TO_NEWEST_MS_PER_VIEWPORT = 260;

/** Set on the scroll root while catch-up eases — disables CV placeholders. */
export const FEED_CATCH_UP_SCROLLING_CLASS = 'is-feed-catch-up-scrolling';

const feedScrollRafByRoot = new WeakMap<HTMLElement, number>();

/** Ease-in-out so the rise accelerates then settles — not a snap ease-out. */
export function feedScrollToNewestEase(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export type ScrollFeedToNewestOptions = {
  onComplete?: () => void;
};

function readFeedScrollTop(root: HTMLElement): number {
  const lenisTop = getAppLenis(root)?.scroll ?? 0;
  return Math.max(root.scrollTop, lenisTop);
}

function beginCatchUpScrolling(root: HTMLElement): void {
  root.classList.add(FEED_CATCH_UP_SCROLLING_CLASS);
}

function endCatchUpScrolling(root: HTMLElement): void {
  root.classList.remove(FEED_CATCH_UP_SCROLLING_CLASS);
}

function jumpFeedScrollToNewest(root: HTMLElement): void {
  const lenis = getAppLenis(root);
  if (lenis) {
    lenis.scrollTo(0, { immediate: true, force: true });
    return;
  }
  root.scrollTop = 0;
}

function cancelFeedScrollToNewest(root: HTMLElement): void {
  const pending = feedScrollRafByRoot.get(root);
  if (pending === undefined) return;
  cancelAnimationFrame(pending);
  feedScrollRafByRoot.delete(root);
  endCatchUpScrolling(root);
}

export function shouldAnimateFeedScrollToNewest(
  scrollTop: number,
  reducedMotion = false
): boolean {
  if (reducedMotion) return false;
  if (!Number.isFinite(scrollTop) || scrollTop <= FEED_SCROLL_AT_TOP_PX) {
    return false;
  }
  return true;
}

/** Longer travel → longer motion, capped so deep lists do not crawl. */
export function feedScrollToNewestDurationMs(
  scrollTop: number,
  clientHeight: number
): number {
  const viewport = Number.isFinite(clientHeight)
    ? Math.max(clientHeight, 1)
    : 1;
  const screens = Math.max(0, scrollTop) / viewport;
  return Math.round(
    Math.min(
      FEED_SCROLL_TO_NEWEST_MAX_MS,
      Math.max(
        FEED_SCROLL_TO_NEWEST_MIN_MS,
        screens * FEED_SCROLL_TO_NEWEST_MS_PER_VIEWPORT
      )
    )
  );
}

function finish(
  root: HTMLElement,
  onComplete: (() => void) | undefined
): void {
  endCatchUpScrolling(root);
  onComplete?.();
}

function animateFeedScrollWithoutLenis(
  root: HTMLElement,
  from: number,
  durationMs: number,
  onComplete: (() => void) | undefined
): void {
  beginCatchUpScrolling(root);
  const started = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - started) / durationMs);
    root.scrollTop = from * (1 - feedScrollToNewestEase(t));
    if (t < 1) {
      feedScrollRafByRoot.set(root, requestAnimationFrame(tick));
      return;
    }
    feedScrollRafByRoot.delete(root);
    root.scrollTop = 0;
    finish(root, onComplete);
  };
  feedScrollRafByRoot.set(root, requestAnimationFrame(tick));
}

/**
 * Scroll to the newest edge. Distance-scaled ease (CV held open) so catch-up
 * reads as scrolling up, not a jump. Reduced motion still jumps.
 */
export function scrollFeedToNewest(
  root: HTMLElement | null | undefined,
  options: ScrollFeedToNewestOptions = {}
): void {
  if (!root) {
    options.onComplete?.();
    return;
  }
  cancelFeedScrollToNewest(root);

  const from = readFeedScrollTop(root);
  if (!shouldAnimateFeedScrollToNewest(from, prefersReducedMotion())) {
    jumpFeedScrollToNewest(root);
    options.onComplete?.();
    return;
  }

  const durationMs = feedScrollToNewestDurationMs(from, root.clientHeight);
  const lenis = getAppLenis(root);
  if (lenis) {
    beginCatchUpScrolling(root);
    lenis.scrollTo(0, {
      force: true,
      duration: durationMs / 1000,
      easing: feedScrollToNewestEase,
      onComplete: () => finish(root, options.onComplete),
    });
    return;
  }

  animateFeedScrollWithoutLenis(root, from, durationMs, options.onComplete);
}
