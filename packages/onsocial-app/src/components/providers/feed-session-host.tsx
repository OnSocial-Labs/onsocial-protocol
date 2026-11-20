'use client';

import {
  Suspense,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { useNoteOsPortalHosts } from '@/contexts/os-portal-host-context';
import { WritingShelfOpening } from '@/components/portfolio/writing-shelf-opening';
import { FeedArticleReadScreen } from '@/features/home/feed-article-read-screen';
import { HomePagePanel } from '@/features/home/home-feed';
import { APP_HOME_PATH } from '@/lib/app-routes';
import { isWritingShelfPath } from '@/lib/overlay-routes';
import {
  endPortfolioShelfHop,
  getPortfolioShelfHopServerSnapshot,
  getPortfolioShelfHopSnapshot,
  hasShelfHopLeftHome,
  markShelfHopLeftHome,
  releaseWritingShelfHold,
  shouldRetainOpenedFeed,
  subscribePortfolioShelfHop,
} from '@/lib/portfolio-shelf-hop';
import {
  clearParkedShelfHopArticle,
  getParkedShelfHopArticle,
  getParkedShelfHopArticleServerSnapshot,
  subscribeParkedShelfHopArticle,
} from '@/lib/shelf-hop-article-park';

/** Feed route only. Query (`?sheet=`) stays on this path. */
export function isFeedSessionPath(pathname: string | null): boolean {
  return pathname === APP_HOME_PATH;
}

/**
 * Writing hop keeps the open reader on the feed until Writing covers it,
 * and until that shelf closes. Every other leave unmounts the feed once
 * the next screen exists.
 */
const SHELF_FEED_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 0,
};

const FRONT_FILL_STYLE: CSSProperties = {
  height: '100%',
  minHeight: '100%',
};

const FRONT_READY_SELECTOR =
  '.portfolio-page, .portfolio-frame, .os-app-screen, .protocol-face-pair';

/**
 * Home mounts while you are on it. The route paints the server seed. Leaving
 * keeps a feed on screen from the saved list until the next screen exists,
 * then drops it. Coming back paints that same list.
 *
 * Soft-nav Writing is special: Next layout `children` is a live slot, so the
 * open article is parked and remounted here under `data-feed-session`.
 */
export function FeedSessionHost({
  page,
  children,
}: {
  page: ReactNode;
  children?: ReactNode;
}) {
  const pathname = usePathname();
  const onFeed = isFeedSessionPath(pathname);
  const hop = useSyncExternalStore(
    subscribePortfolioShelfHop,
    getPortfolioShelfHopSnapshot,
    getPortfolioShelfHopServerSnapshot
  );
  const parked = useSyncExternalStore(
    subscribeParkedShelfHopArticle,
    getParkedShelfHopArticle,
    getParkedShelfHopArticleServerSnapshot
  );
  const shelfHop = hop.active;
  const retainFeed = shouldRetainOpenedFeed({
    onFeed,
    shelfHop,
    holdAccountId: hop.holdAccountId,
    pathname,
  });
  const showParkedReader = Boolean(
    parked && (shelfHop || Boolean(hop.holdAccountId))
  );
  const [openedFeed, setOpenedFeed] = useState<ReactNode>(page);
  if (onFeed && openedFeed !== page && !shelfHop && !hop.holdAccountId) {
    setOpenedFeed(page);
  }
  const [keepFeed, setKeepFeed] = useState(onFeed);
  const notePortalHosts = useNoteOsPortalHosts();
  const hostRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  let feedTree = page;
  if (!onFeed) {
    feedTree = retainFeed ? openedFeed : <HomePagePanel />;
  }

  if (onFeed && !keepFeed) {
    setKeepFeed(true);
  }

  useLayoutEffect(() => {
    if (!shelfHop) return;
    if (!onFeed) {
      markShelfHopLeftHome();
      return;
    }
    if (hasShelfHopLeftHome()) endPortfolioShelfHop();
  }, [onFeed, shelfHop]);

  useLayoutEffect(() => {
    if (shelfHop || !hop.holdAccountId) return;
    if (isWritingShelfPath(hop.holdAccountId, pathname)) return;
    releaseWritingShelfHold();
  }, [hop.holdAccountId, pathname, shelfHop]);

  useLayoutEffect(() => {
    if (onFeed || !keepFeed || shelfHop || retainFeed) return;
    const front = frontRef.current;
    if (!front) return;
    let observer: MutationObserver | null = null;
    const drop = () => {
      if (!front.querySelector(FRONT_READY_SELECTOR)) return;
      observer?.disconnect();
      observer = null;
      setKeepFeed((current) => (current ? false : current));
    };
    drop();
    if (front.querySelector(FRONT_READY_SELECTOR)) return;
    observer = new MutationObserver(drop);
    observer.observe(front, { childList: true, subtree: true });
    return () => observer?.disconnect();
  }, [keepFeed, onFeed, pathname, retainFeed, shelfHop]);

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
  }, [onFeed, keepFeed]);

  const showFeed = onFeed || keepFeed || showParkedReader;
  const pinFeed = showFeed && (shelfHop || retainFeed || showParkedReader);
  // Retained under another route → covered so probes/video/Lenis pause.
  // On the home path the session stays live.
  const feedSession = onFeed || !pinFeed ? 'live' : 'covered';

  useLayoutEffect(() => {
    notePortalHosts();
  }, [notePortalHosts, showFeed, showParkedReader]);

  return (
    <>
      {showFeed ? (
        <div
          ref={hostRef}
          data-feed-session={feedSession}
          style={pinFeed ? SHELF_FEED_STYLE : undefined}
        >
          {showParkedReader && parked ? (
            <FeedArticleReadScreen
              open
              onOpenChange={(next) => {
                if (!next) clearParkedShelfHopArticle();
              }}
              post={parked.post}
              authorProfile={{
                accountId: parked.post.accountId,
                displayName: parked.titleLabel,
                avatarUrl: parked.avatarUrl,
              }}
            />
          ) : (
            <Suspense fallback={null}>{feedTree}</Suspense>
          )}
        </div>
      ) : null}
      <div
        ref={frontRef}
        className="feed-session-front"
        style={showFeed ? { display: 'contents' } : FRONT_FILL_STYLE}
      >
        {onFeed ? null : page}
        {children}
      </div>
      {shelfHop ? <WritingShelfOpening /> : null}
    </>
  );
}
