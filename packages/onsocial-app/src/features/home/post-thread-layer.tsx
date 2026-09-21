'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import type { PostRow } from '@onsocial/sdk';
import { ChevronLeftIcon, OsIconAction, OsPageSheet } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useViewerDockMood } from '@/hooks/use-viewer-dock-mood';
import { accountIdsEqual } from '@/lib/account-match';
import type { PersonalPostPageData } from '@/lib/load-personal-post-page';
import {
  canonicalizeDropLayerHref,
  collectionPath,
  parseInAppDropLayerHref,
} from '@/lib/app-routes';
import {
  canonicalizePostLayerHref,
  parseInAppPostLayerHref,
  personalPostPath,
} from '@/lib/post-routes';
import {
  isOsMediaFaceOpen,
  nextPostLayerZIndex,
  SHEET_Z,
} from '@/lib/sheet-z';

const LivePersonalPostPanel = dynamic(
  () =>
    import('@/features/home/live-personal-post-panel').then(
      (mod) => mod.LivePersonalPostPanel
    ),
  { ssr: false }
);

const CollectionPagePanel = dynamic(
  () =>
    import('@/features/scarces/collection-page-panel').then(
      (mod) => mod.CollectionPagePanel
    ),
  { ssr: false }
);

const POST_LAYER_STATE_KEY = 'onsocialPostLayer';
const POST_LAYER_DEPTH_KEY = 'onsocialPostLayerDepth';
const POST_LAYER_GUARD_KEY = '__onsocialPostLayerPopGuard';

type PostLayerPopGuard = {
  depth: number;
  onPop: () => void;
};

/** Capture listener before Next's bubble popstate (registered at import). */
function getPostLayerPopGuard(): PostLayerPopGuard {
  const w = window as Window & {
    [POST_LAYER_GUARD_KEY]?: PostLayerPopGuard;
  };
  let guard = w[POST_LAYER_GUARD_KEY];
  if (!guard) {
    guard = { depth: 0, onPop: () => {} };
    w[POST_LAYER_GUARD_KEY] = guard;
    window.addEventListener(
      'popstate',
      (event) => {
        if (guard!.depth <= 0) return;
        event.stopImmediatePropagation();
        event.stopPropagation();
        guard!.onPop();
      },
      true
    );
  }
  return guard;
}

function ensurePostThreadParkedStyle(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('post-thread-sheet-parked-style')) return;
  const style = document.createElement('style');
  style.id = 'post-thread-sheet-parked-style';
  style.textContent =
    '.glass-sheet-root.post-thread-sheet-parked{visibility:hidden!important;pointer-events:none!important}';
  document.head.appendChild(style);
}

function nativeHistoryPushState(state: object, url: string): void {
  History.prototype.pushState.call(window.history, state, '', url);
}

function nativeHistoryReplaceState(state: object, url: string): void {
  History.prototype.replaceState.call(window.history, state, '', url);
}

function withoutPostLayerHistoryState(): object {
  const prev = typeof window === 'undefined' ? null : window.history.state;
  const base =
    prev && typeof prev === 'object' && !Array.isArray(prev)
      ? { ...(prev as Record<string, unknown>) }
      : {};
  delete base[POST_LAYER_STATE_KEY];
  delete base[POST_LAYER_DEPTH_KEY];
  return base;
}

type PostThreadLayerTarget = {
  id: string;
  kind: 'post';
  accountId: string;
  postId: string;
  root: PostRow | null;
  zIndex: number;
};

type DropLayerTarget = {
  id: string;
  kind: 'drop';
  collectionId: string;
  zIndex: number;
};

type PlaceLayerTarget = PostThreadLayerTarget | DropLayerTarget;

type PostThreadLayerValue = {
  openPostThread: (input: { href: string; root?: PostRow | null }) => boolean;
  openDrop: (input: { href: string }) => boolean;
  closePostThread: () => void;
};

const PostThreadLayerContext = createContext<PostThreadLayerValue | null>(null);

const NOOP_LAYER: PostThreadLayerValue = {
  openPostThread: () => false,
  openDrop: () => false,
  closePostThread: () => {},
};

function collectionIdsEqual(left: string, right: string): boolean {
  try {
    return decodeURIComponent(left).trim() === decodeURIComponent(right).trim();
  } catch {
    return left.trim() === right.trim();
  }
}

/** Portfolio face only — `/@id`, not a post, shelf, or standing URL. */
export function isPortfolioFaceHref(href: string | null | undefined): boolean {
  const raw = (href ?? '').trim();
  if (!raw.startsWith('/@')) return false;
  const path = raw.split(/[?#]/)[0] ?? '';
  return /^\/@[^/]+$/.test(path);
}

function isOverlayPlacePathname(pathname: string): boolean {
  return (
    parseInAppPostLayerHref(pathname) != null ||
    parseInAppDropLayerHref(pathname) != null
  );
}

function nextStackedLayerZ(stack: PlaceLayerTarget[]): number {
  const top = stack[stack.length - 1];
  return nextPostLayerZIndex(top?.zIndex ?? null, isOsMediaFaceOpen());
}

function placeLayerHref(layer: PlaceLayerTarget): string {
  if (layer.kind === 'drop') return collectionPath(layer.collectionId);
  return personalPostPath(layer.accountId, layer.postId);
}

function seedEmbeddedThread(root: PostRow): PersonalPostPageData {
  return {
    root,
    replies: [],
    quotes: [],
    replyTree: [],
    hasMoreReplies: false,
    hasMoreQuotes: false,
    engagement: {},
    scarceEmbeds: {},
  };
}

function historyHasPostLayer(): boolean {
  if (typeof window === 'undefined') return false;
  const state = window.history.state;
  return Boolean(
    state &&
      typeof state === 'object' &&
      (state as { [POST_LAYER_STATE_KEY]?: unknown })[POST_LAYER_STATE_KEY]
  );
}

function withPostLayerHistoryState(): object {
  const prev = typeof window === 'undefined' ? null : window.history.state;
  const base =
    prev && typeof prev === 'object' && !Array.isArray(prev)
      ? { ...(prev as Record<string, unknown>) }
      : {};
  return {
    ...base,
    // Next popstate hard-reloads when __NA is missing. Overlay entries copy
    // the underlay tree and never own a real App Router page.
    __NA: true,
    [POST_LAYER_STATE_KEY]: true,
    [POST_LAYER_DEPTH_KEY]: 1,
  };
}

function captureUnderlayScroll(): { el: HTMLElement; top: number } | null {
  const bodies = document.querySelectorAll<HTMLElement>('.os-app-screen-body');
  for (const body of bodies) {
    if (
      body.closest(
        '.post-thread-sheet-panel, .drop-sheet-panel'
      )
    ) {
      continue;
    }
    return { el: body, top: body.scrollTop };
  }
  return null;
}

/** Cmd/ctrl/shift/alt or non-primary button — let the browser own the click. */
export function isUnmodifiedPrimaryClick(
  event: Pick<
    ReactMouseEvent,
    'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'button'
  >
): boolean {
  return (
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    event.button === 0
  );
}

export function usePostThreadLayer(): PostThreadLayerValue {
  return useContext(PostThreadLayerContext) ?? NOOP_LAYER;
}

function PostThreadSheet({
  layer,
  open,
  parked,
  onClose,
  onClosed,
  onOpenProfile,
  zIndex,
  moodId,
  moodStyle,
}: {
  layer: PostThreadLayerTarget;
  open: boolean;
  /** Portfolio is the screen. Keep this post mounted and quiet underneath. */
  parked: boolean;
  onClose: () => void;
  onClosed: () => void;
  onOpenProfile: (href: string) => void;
  zIndex: number;
  moodId?: string;
  moodStyle?: CSSProperties;
}) {
  const titleId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const resumeMediaRef = useRef<HTMLMediaElement[]>([]);
  const initial = useMemo(
    () => (layer.root ? seedEmbeddedThread(layer.root) : null),
    [layer]
  );

  useLayoutEffect(() => {
    if (!parked) return;
    let hushed = false;
    let sheetRoot: HTMLElement | null = null;
    const quiet = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLMediaElement)) return;
      if (!target.paused) resumeMediaRef.current.push(target);
      target.pause();
      window.setTimeout(() => target.pause(), 0);
    };
    const allowScroll = (event: Event) => {
      event.stopPropagation();
    };
    const apply = () => {
      const root = bodyRef.current?.closest('.glass-sheet-root');
      if (!(root instanceof HTMLElement)) return;
      sheetRoot = root;
      if (root.style.visibility !== 'hidden') {
        root.style.visibility = 'hidden';
        root.style.pointerEvents = 'none';
        root.setAttribute('aria-hidden', 'true');
        root.inert = true;
      }
      if (hushed) return;
      hushed = true;
      const playing: HTMLMediaElement[] = [];
      root.querySelectorAll('video, audio').forEach((node) => {
        if (!(node instanceof HTMLMediaElement) || node.paused) return;
        playing.push(node);
        node.pause();
        window.setTimeout(() => node.pause(), 0);
      });
      resumeMediaRef.current = playing;
      root.addEventListener('play', quiet, true);
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('wheel', allowScroll, true);
    window.addEventListener('touchmove', allowScroll, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('wheel', allowScroll, true);
      window.removeEventListener('touchmove', allowScroll, true);
      const root = sheetRoot;
      if (root instanceof HTMLElement) {
        root.removeEventListener('play', quiet, true);
        root.style.visibility = '';
        root.style.pointerEvents = '';
        root.removeAttribute('aria-hidden');
        root.inert = false;
      }
      for (const node of resumeMediaRef.current) {
        if (node.isConnected) void node.play().catch(() => undefined);
      }
      resumeMediaRef.current = [];
    };
  }, [parked]);

  const openProfileFromPost = (event: ReactMouseEvent) => {
    if (!isUnmodifiedPrimaryClick(event)) return;
    const node = event.target;
    if (!(node instanceof Element)) return;
    const anchor = node.closest('a');
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const href = anchor.getAttribute('href');
    if (!href || !isPortfolioFaceHref(href)) return;
    event.preventDefault();
    event.stopPropagation();
    onOpenProfile(href);
  };

  return (
    <OsPageSheet
      open={open}
      onClose={onClose}
      onClosed={onClosed}
      surface="page"
      presentation="appear"
      zIndex={zIndex}
      ariaLabelledBy={titleId}
      backdropLabel="Back"
      keepDock
      moodId={moodId}
      moodStyle={moodStyle}
      panelClassName="post-thread-sheet-panel"
      bodyClassName="post-thread-sheet-body"
      rootClassName={parked ? 'post-thread-sheet-parked' : undefined}
      lockScroll={!parked}
      header={null}
    >
      <div
        ref={bodyRef}
        className="post-thread-sheet-fill"
        onClickCapture={openProfileFromPost}
      >
        <OsAppScreen
          title="Post"
          glassChrome
          compactChrome
          embedded
          heading={
            <span id={titleId} className="os-app-screen-title">
              Post
            </span>
          }
          leading={
            <OsIconAction ariaLabel="Back" onClick={onClose}>
              <ChevronLeftIcon className="glass-sheet-close-icon" aria-hidden />
            </OsIconAction>
          }
        >
          <LivePersonalPostPanel
            author={layer.accountId}
            postId={layer.postId}
            initial={initial}
            embedded
            replyDockEnabled={open && !parked}
          />
        </OsAppScreen>
      </div>
    </OsPageSheet>
  );
}

function DropLayerSheet({
  layer,
  open,
  onClose,
  onClosed,
  zIndex,
  moodId,
  moodStyle,
}: {
  layer: DropLayerTarget;
  open: boolean;
  onClose: () => void;
  onClosed: () => void;
  zIndex: number;
  moodId?: string;
  moodStyle?: CSSProperties;
}) {
  const titleId = useId();
  return (
    <OsPageSheet
      open={open}
      onClose={onClose}
      onClosed={onClosed}
      surface="page"
      presentation="appear"
      zIndex={zIndex}
      ariaLabelledBy={titleId}
      backdropLabel="Back"
      keepDock
      moodId={moodId}
      moodStyle={moodStyle}
      panelClassName="drop-sheet-panel"
      bodyClassName="drop-sheet-body"
      header={null}
    >
      <span id={titleId} className="sr-only">
        Drop
      </span>
      <CollectionPagePanel
        collectionId={layer.collectionId}
        initial={null}
        embedded
        onClose={onClose}
      />
    </OsPageSheet>
  );
}

export function PostThreadLayerProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const viewerMood = useViewerDockMood();
  const [stack, setStack] = useState<PlaceLayerTarget[]>([]);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [underlayPath, setUnderlayPath] = useState<string | null>(null);
  /** Portfolio face opened from the post. The post stays mounted underneath. */
  const [profileHop, setProfileHop] = useState<string | null>(null);
  const [sawProfileHop, setSawProfileHop] = useState(false);
  const underlayPathRef = useRef<string | null>(null);
  const underlayScrollRef = useRef<{ el: HTMLElement; top: number } | null>(
    null
  );
  const seqRef = useRef(0);
  const stackRef = useRef(stack);
  const closingIdRef = useRef<string | null>(closingId);
  useLayoutEffect(() => {
    stackRef.current = stack;
    closingIdRef.current = closingId;
    underlayPathRef.current = underlayPath;
  }, [closingId, stack, underlayPath]);

  // Next left the page we opened over — drop the overlay without an effect.
  // A profile opened from this post is the next screen, not a reason to drop it.
  const onProfileHop =
    profileHop != null &&
    (pathname === profileHop || pathname.startsWith(`${profileHop}?`));
  if (onProfileHop && !sawProfileHop) {
    setSawProfileHop(true);
  }
  if (
    profileHop &&
    sawProfileHop &&
    underlayPath != null &&
    pathname === underlayPath
  ) {
    setSawProfileHop(false);
    setProfileHop(null);
  }
  if (
    stack.length > 0 &&
    underlayPath != null &&
    pathname !== underlayPath &&
    !isOverlayPlacePathname(pathname) &&
    !onProfileHop
  ) {
    if (sawProfileHop) setSawProfileHop(false);
    setProfileHop(null);
    setStack([]);
    setClosingId(null);
    setUnderlayPath(null);
  }

  const beginCloseTop = useCallback(() => {
    const top = stackRef.current[stackRef.current.length - 1];
    if (!top || closingIdRef.current) return false;
    closingIdRef.current = top.id;
    setClosingId(top.id);
    return true;
  }, []);

  const syncOverlayUrl = useCallback((href: string) => {
    if (typeof window === 'undefined') return;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl === href) return;
    nativeHistoryReplaceState(withPostLayerHistoryState(), href);
  }, []);

  const closePostThread = useCallback(() => {
    const remaining = stackRef.current.slice(0, -1);
    if (!beginCloseTop()) return;
    if (typeof window === 'undefined') return;
    const prev = remaining[remaining.length - 1];
    if (prev) {
      // Stay on the single overlay history entry. Extra pushes made the
      // second Back traverse into /@account/posts/:id and remount Home.
      syncOverlayUrl(placeLayerHref(prev));
      return;
    }
    if (historyHasPostLayer()) {
      window.history.back();
      return;
    }
    nativeHistoryReplaceState(
      withoutPostLayerHistoryState(),
      underlayPathRef.current ?? '/home'
    );
  }, [beginCloseTop, syncOverlayUrl]);

  const openPostThread = useCallback(
    ({ href, root = null }: { href: string; root?: PostRow | null }) => {
      const parsed = parseInAppPostLayerHref(href);
      if (!parsed) return false;
      const canonical = canonicalizePostLayerHref(href);
      if (!canonical) return false;

      const currentPage = parseInAppPostLayerHref(pathname);
      if (
        currentPage &&
        accountIdsEqual(currentPage.accountId, parsed.accountId) &&
        currentPage.postId === parsed.postId &&
        stackRef.current.length === 0
      ) {
        return true;
      }

      const top = stackRef.current[stackRef.current.length - 1];
      if (
        top?.kind === 'post' &&
        accountIdsEqual(top.accountId, parsed.accountId) &&
        top.postId === parsed.postId
      ) {
        return true;
      }

      // One post on screen. Another post replaces this reader so reply and
      // sort drawers stay above the icons instead of opening under a pile.
      if (stackRef.current.length > 0) {
        const next: PostThreadLayerTarget = {
          id: `post-layer-${++seqRef.current}`,
          kind: 'post',
          accountId: parsed.accountId,
          postId: parsed.postId,
          root,
          zIndex: stackRef.current[0]?.zIndex ?? SHEET_Z.overlayHost,
        };
        closingIdRef.current = null;
        setClosingId(null);
        stackRef.current = [next];
        setStack([next]);
        if (typeof window === 'undefined') return true;
        getPostLayerPopGuard().depth = 1;
        const currentUrl = `${window.location.pathname}${window.location.search}`;
        if (currentUrl !== canonical) {
          nativeHistoryReplaceState(withPostLayerHistoryState(), canonical);
        }
        return true;
      }

      const next: PostThreadLayerTarget = {
        id: `post-layer-${++seqRef.current}`,
        kind: 'post',
        accountId: parsed.accountId,
        postId: parsed.postId,
        root,
        zIndex: nextStackedLayerZ(stackRef.current),
      };
      if (underlayPathRef.current == null) {
        underlayPathRef.current = pathname;
        setUnderlayPath(pathname);
        if (typeof window !== 'undefined') {
          underlayScrollRef.current = captureUnderlayScroll();
        }
      }
      const isFirst = stackRef.current.length === 0;
      closingIdRef.current = null;
      setClosingId(null);
      setStack((prev) => [...prev, next]);

      if (typeof window === 'undefined') return true;
      getPostLayerPopGuard().depth = 1;
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (currentUrl === canonical) return true;
      if (isFirst) {
        nativeHistoryPushState(withPostLayerHistoryState(), canonical);
      } else {
        nativeHistoryReplaceState(withPostLayerHistoryState(), canonical);
      }
      return true;
    },
    [pathname]
  );

  const openDrop = useCallback(
    ({ href }: { href: string }) => {
      const parsed = parseInAppDropLayerHref(href);
      if (!parsed) return false;
      const canonical = canonicalizeDropLayerHref(href);
      if (!canonical) return false;

      const currentPage = parseInAppDropLayerHref(pathname);
      if (
        currentPage &&
        collectionIdsEqual(currentPage.collectionId, parsed.collectionId) &&
        stackRef.current.length === 0
      ) {
        return true;
      }

      const top = stackRef.current[stackRef.current.length - 1];
      if (
        top?.kind === 'drop' &&
        collectionIdsEqual(top.collectionId, parsed.collectionId)
      ) {
        return true;
      }

      if (stackRef.current.length > 0) {
        const next: DropLayerTarget = {
          id: `drop-layer-${++seqRef.current}`,
          kind: 'drop',
          collectionId: parsed.collectionId,
          zIndex: stackRef.current[0]?.zIndex ?? SHEET_Z.overlayHost,
        };
        closingIdRef.current = null;
        setClosingId(null);
        stackRef.current = [next];
        setStack([next]);
        if (typeof window === 'undefined') return true;
        getPostLayerPopGuard().depth = 1;
        const currentUrl = `${window.location.pathname}${window.location.search}`;
        if (currentUrl !== canonical) {
          nativeHistoryReplaceState(withPostLayerHistoryState(), canonical);
        }
        return true;
      }

      const next: DropLayerTarget = {
        id: `drop-layer-${++seqRef.current}`,
        kind: 'drop',
        collectionId: parsed.collectionId,
        zIndex: nextStackedLayerZ(stackRef.current),
      };
      if (underlayPathRef.current == null) {
        underlayPathRef.current = pathname;
        setUnderlayPath(pathname);
        if (typeof window !== 'undefined') {
          underlayScrollRef.current = captureUnderlayScroll();
        }
      }
      const isFirst = stackRef.current.length === 0;
      closingIdRef.current = null;
      setClosingId(null);
      setStack((prev) => [...prev, next]);

      if (typeof window === 'undefined') return true;
      getPostLayerPopGuard().depth = 1;
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (currentUrl === canonical) return true;
      if (isFirst) {
        nativeHistoryPushState(withPostLayerHistoryState(), canonical);
      } else {
        nativeHistoryReplaceState(withPostLayerHistoryState(), canonical);
      }
      return true;
    },
    [pathname]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const guard = getPostLayerPopGuard();
    guard.depth = stack.length > 0 && !profileHop ? 1 : 0;
    guard.onPop = () => {
      const remaining = stackRef.current.slice(0, -1);
      const prev = remaining[remaining.length - 1];
      if (prev) {
        nativeHistoryPushState(
          withPostLayerHistoryState(),
          placeLayerHref(prev)
        );
      }
      beginCloseTop();
    };
  }, [beginCloseTop, profileHop, stack.length]);

  const handleSheetClosed = useCallback((id: string) => {
    if (closingIdRef.current !== id) return;
    closingIdRef.current = null;
    setClosingId(null);
    const next = stackRef.current.filter((layer) => layer.id !== id);
    stackRef.current = next;
    setStack(next);
    if (next.length === 0) {
      underlayPathRef.current = null;
      setUnderlayPath(null);
      const saved = underlayScrollRef.current;
      underlayScrollRef.current = null;
      if (saved?.el.isConnected) {
        saved.el.scrollTop = saved.top;
      }
    }
    if (typeof window !== 'undefined') {
      getPostLayerPopGuard().depth = next.length > 0 ? 1 : 0;
    }
  }, []);

  const openProfileFromLayer = useCallback(
    (href: string) => {
      const path = href.split(/[?#]/)[0] ?? href;
      const underlay = underlayPathRef.current;
      ensurePostThreadParkedStyle();
      setProfileHop(path);
      // Keep the post mounted. Drop only its history flag so the portfolio
      // sits on the feed entry; Back lands here and the post is shown again.
      const guard = getPostLayerPopGuard();
      guard.depth = 0;
      if (typeof window !== 'undefined' && historyHasPostLayer()) {
        nativeHistoryReplaceState(
          withoutPostLayerHistoryState(),
          underlay ?? path
        );
      }
      if (path !== pathname) router.push(href);
    },
    [pathname, router]
  );

  useLayoutEffect(() => {
    if (profileHop || stack.length === 0 || pathname !== underlayPath) return;
    if (typeof window === 'undefined' || historyHasPostLayer()) return;
    const top = stack[stack.length - 1];
    if (!top || top.kind !== 'post') return;
    nativeHistoryPushState(withPostLayerHistoryState(), placeLayerHref(top));
    getPostLayerPopGuard().depth = 1;
  }, [pathname, profileHop, stack, underlayPath]);

  const value = useMemo(
    () => ({
      openPostThread,
      openDrop,
      closePostThread,
    }),
    [closePostThread, openDrop, openPostThread]
  );

  return (
    <PostThreadLayerContext.Provider value={value}>
      {children}
      {stack.map((layer, index) => {
        const isTop = index === stack.length - 1;
        const shared = {
          open: layer.id !== closingId,
          onClose: isTop ? closePostThread : () => {},
          onClosed: () => handleSheetClosed(layer.id),
          zIndex: layer.zIndex,
          moodId: viewerMood.moodId ?? undefined,
          moodStyle: viewerMood.style,
        };
        if (layer.kind === 'drop') {
          return <DropLayerSheet key={layer.id} layer={layer} {...shared} />;
        }
        return (
          <PostThreadSheet
            key={layer.id}
            layer={layer}
            parked={onProfileHop}
            onOpenProfile={openProfileFromLayer}
            {...shared}
          />
        );
      })}
    </PostThreadLayerContext.Provider>
  );
}
