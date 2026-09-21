'use client';

import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { HomePagePanel } from '@/features/home/home-feed';
import { APP_HOME_PATH } from '@/lib/app-routes';
import {
  endPortfolioShelfHop,
  hasShelfHopLeftHome,
  isPortfolioShelfHop,
  markShelfHopLeftHome,
  subscribePortfolioShelfHop,
} from '@/lib/portfolio-shelf-hop';

/** Feed route only. Query (`?sheet=`) stays on this path. */
export function isFeedSessionPath(pathname: string | null): boolean {
  return pathname === APP_HOME_PATH;
}

/**
 * Keep the feed's box while it is covered. `display: none` lets Lenis
 * clamp the scroller back to the top.
 */
const COVERED_FEED_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  visibility: 'hidden',
  pointerEvents: 'none',
  zIndex: 0,
};

/**
 * Home mounts once per tab. Article and profile routes cover it.
 * Back to /home reveals the same list and the same line.
 * A hard refresh of an article never mounts this feed.
 */
export function FeedSessionHost({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const onFeed = isFeedSessionPath(pathname);
  const shelfHop = useSyncExternalStore(
    subscribePortfolioShelfHop,
    isPortfolioShelfHop,
    () => false
  );
  const [mounted, setMounted] = useState(onFeed);
  const hostRef = useRef<HTMLDivElement>(null);
  const coveredScrollRef = useRef(0);

  useEffect(() => {
    if (onFeed) setMounted(true);
  }, [onFeed]);

  useEffect(() => {
    const body = hostRef.current?.querySelector('.os-app-screen-body');
    if (!(body instanceof HTMLElement)) return;
    const remember = () => {
      if (body.scrollTop > 0) coveredScrollRef.current = body.scrollTop;
    };
    remember();
    body.addEventListener('scroll', remember, { passive: true });
    return () => body.removeEventListener('scroll', remember);
  }, [mounted, onFeed]);

  useLayoutEffect(() => {
    const body = hostRef.current?.querySelector('.os-app-screen-body');
    if (!(body instanceof HTMLElement)) return;
    if (!onFeed) {
      if (body.scrollTop > 0) coveredScrollRef.current = body.scrollTop;
      return;
    }
    const saved = coveredScrollRef.current;
    if (saved > 0 && body.scrollTop < 2) {
      body.scrollTop = saved;
    }
  }, [onFeed]);

  useLayoutEffect(() => {
    if (!shelfHop) return;
    if (!onFeed) {
      markShelfHopLeftHome();
      return;
    }
    if (hasShelfHopLeftHome()) endPortfolioShelfHop();
  }, [onFeed, shelfHop]);

  useLayoutEffect(() => {
    const root = hostRef.current;
    if (!root || onFeed) return;
    const hush = (node: HTMLMediaElement) => {
      node.pause();
      window.setTimeout(() => node.pause(), 0);
    };
    const quiet = (event?: Event) => {
      const target = event?.target;
      if (target instanceof HTMLMediaElement) {
        hush(target);
        return;
      }
      root.querySelectorAll('video, audio').forEach((node) => {
        if (node instanceof HTMLMediaElement) hush(node);
      });
    };
    quiet();
    root.addEventListener('play', quiet, true);
    return () => root.removeEventListener('play', quiet, true);
  }, [onFeed]);

  /* Writing hops through the profile face. Keep the article on screen until
   * that list covers it, instead of painting the portfolio underneath. */
  const coveredStyle = onFeed
    ? undefined
    : shelfHop
      ? { ...COVERED_FEED_STYLE, visibility: 'visible' as const }
      : COVERED_FEED_STYLE;

  return (
    <>
      {mounted ? (
        <div
          ref={hostRef}
          data-feed-session={onFeed ? 'live' : 'covered'}
          style={coveredStyle}
          inert={!onFeed ? true : undefined}
          aria-hidden={!onFeed && !shelfHop ? true : undefined}
        >
          <Suspense fallback={null}>
            <HomePagePanel />
          </Suspense>
        </div>
      ) : null}
      {children}
    </>
  );
}
