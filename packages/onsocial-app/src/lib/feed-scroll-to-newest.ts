import { prefersReducedMotion } from '@/lib/app-smooth-scroll';

/** Already at the head — don't animate a no-op. */
export const FEED_SCROLL_AT_TOP_PX = 8;

/**
 * Smooth only when the newest card is about one screen away.
 * Farther than that, jump — a long ease feels like the feed is drifting.
 */
export function feedScrollToNewestBehavior(
  scrollTop: number,
  clientHeight: number,
  reducedMotion = false
): ScrollBehavior {
  if (reducedMotion) return 'auto';
  if (!Number.isFinite(scrollTop) || scrollTop <= FEED_SCROLL_AT_TOP_PX) {
    return 'auto';
  }
  const viewport = Number.isFinite(clientHeight)
    ? Math.max(clientHeight, 1)
    : 1;
  return scrollTop <= viewport ? 'smooth' : 'auto';
}

export function scrollFeedToNewest(root: HTMLElement | null | undefined): void {
  if (!root) return;
  root.scrollTo({
    top: 0,
    behavior: feedScrollToNewestBehavior(
      root.scrollTop,
      root.clientHeight,
      prefersReducedMotion()
    ),
  });
}
