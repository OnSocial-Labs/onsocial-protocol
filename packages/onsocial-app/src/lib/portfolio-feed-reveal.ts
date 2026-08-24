/** Same-page “open the feed” signal (drawer link, `/feed` soft intercept). */
export const PORTFOLIO_FEED_REVEAL_EVENT = 'onsocial:portfolio-feed-reveal';

export function requestPortfolioFeedReveal(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PORTFOLIO_FEED_REVEAL_EVENT));
}

/** Prefetch lead when the hero tail enters the scrollport. */
export const PORTFOLIO_FEED_REVEAL_LEAD_PX = 96;

/** Hero fills the screen — no real scroll slack until feed mounts. */
export const PORTFOLIO_FEED_LOCKED_MAX_SCROLL_PX = 4;

export interface PortfolioFeedRevealInput {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  /** Wheel deltaY or touch scroll-down delta; omit for scroll events. */
  scrollIntentDelta?: number;
  /** Set after pointer / wheel / touch on the portfolio scroller. */
  userGestured: boolean;
}

/**
 * Face-first portfolio — feed opens only on explicit scroll intent.
 * Scroll restoration and layout scroll events are ignored until the user gestures.
 */
export function shouldRevealPortfolioFeed({
  scrollTop,
  scrollHeight,
  clientHeight,
  scrollIntentDelta,
  userGestured,
}: PortfolioFeedRevealInput): boolean {
  const maxScroll = Math.max(0, scrollHeight - clientHeight);
  const atScrollTail =
    scrollTop + clientHeight >= scrollHeight - PORTFOLIO_FEED_REVEAL_LEAD_PX;
  const scrollIntentDown =
    scrollIntentDelta != null && scrollIntentDelta > 0;

  // Locked face — accept downward wheel / touch only (no scroll events).
  if (maxScroll <= PORTFOLIO_FEED_LOCKED_MAX_SCROLL_PX) {
    return scrollIntentDown;
  }

  // Downward intent while already at the hero tail (wheel at end of scroll).
  if (scrollIntentDown && atScrollTail) {
    return true;
  }

  if (!userGestured || scrollTop <= 0) {
    return false;
  }

  return atScrollTail;
}
