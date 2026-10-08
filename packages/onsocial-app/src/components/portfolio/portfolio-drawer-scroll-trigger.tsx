'use client';

import { useEffect, useRef } from 'react';
import { usePageContentDrawer } from '@/contexts/page-content-drawer-context';
import {
  normalizeLegacyPortfolioRailUrl,
  portfolioRailTabFromSearch,
} from '@/components/portfolio/profile-feed-tabs';
import { PORTFOLIO_FEED_SECTION_ID } from '@/lib/overlay-routes';
import {
  PORTFOLIO_FEED_REVEAL_EVENT,
  isPortfolioFeedLayoutScroll,
  shouldRevealPortfolioFeed,
} from '@/lib/portfolio-feed-reveal';

function hasPortfolioFeedHash(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hash === `#${PORTFOLIO_FEED_SECTION_ID}`;
}

/**
 * Face stays a locked card — scrolling down (or a wheel / swipe on a short
 * face) pulls the page drawer up instead of scrolling into content.
 * `#portfolio-feed` links and the reveal event open the same drawer.
 */
export function PortfolioDrawerScrollTrigger() {
  const { isOpen, open } = usePageContentDrawer();
  const userGesturedRef = useRef(false);
  const anchorRef = useRef<HTMLSpanElement>(null);

  // One-shot deep link: open the drawer, then strip the hash so a later
  // refresh lands on the plain portfolio face again.
  useEffect(() => {
    const openFromSignal = () => {
      open();
      if (hasPortfolioFeedHash()) {
        window.history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search
        );
      }
    };

    const onHash = () => {
      if (hasPortfolioFeedHash()) openFromSignal();
    };

    onHash();
    // Shared section links (`?tab=scarces`, legacy store/drops) open the drawer.
    if (portfolioRailTabFromSearch(window.location.search)) {
      normalizeLegacyPortfolioRailUrl();
      open();
    }
    window.addEventListener('hashchange', onHash);
    window.addEventListener(PORTFOLIO_FEED_REVEAL_EVENT, openFromSignal);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener(PORTFOLIO_FEED_REVEAL_EVENT, openFromSignal);
    };
  }, [open]);

  useEffect(() => {
    if (isOpen) return;

    const layer = anchorRef.current?.closest('.portfolio-os-layer');
    const frame = layer?.previousElementSibling;
    const scoped =
      frame instanceof HTMLElement
        ? frame.querySelector(':scope > .portfolio-page')
        : null;
    const root =
      scoped instanceof HTMLElement
        ? scoped
        : document.querySelector('.portfolio-page');
    if (!(root instanceof HTMLElement)) return;

    userGesturedRef.current = false;
    let layoutSize = {
      clientHeight: root.clientHeight,
      scrollHeight: root.scrollHeight,
    };

    const markUserGesture = () => {
      userGesturedRef.current = true;
    };

    const tryOpen = (scrollIntentDelta?: number) => {
      if (
        shouldRevealPortfolioFeed({
          scrollTop: root.scrollTop,
          scrollHeight: root.scrollHeight,
          clientHeight: root.clientHeight,
          scrollIntentDelta,
          userGestured: userGesturedRef.current,
        })
      ) {
        open();
      }
    };

    const onScroll = () => {
      const nextSize = {
        clientHeight: root.clientHeight,
        scrollHeight: root.scrollHeight,
      };
      const layoutScroll = isPortfolioFeedLayoutScroll(layoutSize, nextSize);
      layoutSize = nextSize;
      if (layoutScroll) return;
      tryOpen();
    };

    const onWheel = (event: WheelEvent) => {
      // Pinch and page zoom report as ctrl+wheel. That is not a swipe.
      if (event.ctrlKey) return;
      markUserGesture();
      tryOpen(event.deltaY);
    };

    let touchStartY: number | null = null;
    const onTouchStart = (event: TouchEvent) => {
      markUserGesture();
      touchStartY = event.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (event: TouchEvent) => {
      markUserGesture();
      const currentY = event.touches[0]?.clientY;
      if (currentY == null || touchStartY == null) return;
      const delta = touchStartY - currentY;
      touchStartY = currentY;
      if (delta > 0) tryOpen(delta);
    };

    root.addEventListener('scroll', onScroll, { passive: true });
    root.addEventListener('wheel', onWheel, { passive: true });
    root.addEventListener('touchstart', onTouchStart, { passive: true });
    root.addEventListener('touchmove', onTouchMove, { passive: true });
    root.addEventListener('pointerdown', markUserGesture, { passive: true });

    return () => {
      root.removeEventListener('scroll', onScroll);
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('touchstart', onTouchStart);
      root.removeEventListener('touchmove', onTouchMove);
      root.removeEventListener('pointerdown', markUserGesture);
    };
  }, [isOpen, open]);

  return <span ref={anchorRef} hidden />;
}
