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
  parseInAppPostQuotesHref,
  personalPostPath,
  personalPostQuotesPath,
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

const PostQuotesPanel = dynamic(
  () =>
    import('@/features/home/post-quotes-panel').then(
      (mod) => mod.PostQuotesPanel
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

type QuotesLayerTarget = {
  id: string;
  kind: 'quotes';
  accountId: string;
  postId: string;
  zIndex: number;
};

type PlaceLayerTarget =
  | PostThreadLayerTarget
  | DropLayerTarget
  | QuotesLayerTarget;

type ReaderLayerTarget = PostThreadLayerTarget | QuotesLayerTarget;

type PostThreadLayerValue = {
  openPostThread: (input: { href: string; root?: PostRow | null }) => boolean;
  openPostQuotes: (input: { href: string }) => boolean;
  openDrop: (input: { href: string }) => boolean;
  closePostThread: () => void;
};

const PostThreadLayerContext = createContext<PostThreadLayerValue | null>(null);

const NOOP_LAYER: PostThreadLayerValue = {
  openPostThread: () => false,
  openPostQuotes: () => false,
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
  if (layer.kind === 'quotes') {
    return personalPostQuotesPath(layer.accountId, layer.postId);
  }
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
  layer: ReaderLayerTarget;
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
  const quotes = layer.kind === 'quotes';
  const title = quotes ? 'Quotes' : 'Post';
  const initial = useMemo(
    () => (layer.kind === 'post' && layer.root ? seedEmbeddedThread(layer.root) : null),
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

  useLayoutEffect(() => {
    const screen = bodyRef.current?.querySelector('.os-app-screen-body');
    if (screen instanceof HTMLElement) screen.scrollTop = 0;
  }, [layer.accountId, layer.kind, layer.postId]);

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
          title={title}
          glassChrome
          compactChrome
          embedded
          heading={
            <span id={titleId} className="os-app-screen-title">
              {title}
            </span>
          }
          leading={
            <OsIconAction ariaLabel="Back" onClick={onClose}>
              <ChevronLeftIcon className="glass-sheet-close-icon" aria-hidden />
            </OsIconAction>
          }
        >
          {layer.kind === 'quotes' ? (
            <PostQuotesPanel
              author={layer.accountId}
              postId={layer.postId}
              embedded
            />
          ) : (
            <LivePersonalPostPanel
              key={`${layer.accountId}:${layer.postId}`}
              author={layer.accountId}
              postId={layer.postId}
              initial={initial}
              embedded
              replyDockEnabled={open && !parked}
            />
          )}
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
    const current = stackRef.current;
    const top = current[current.length - 1];
    // Header back walks one step: a reply, then quotes, then the post.
    // The sheet stays up until the last step.
    if (
      current.length > 1 &&
      (top?.kind === 'post' || top?.kind === 'quotes')
    ) {
      const next = current.slice(0, -1);
      const prev = next[next.length - 1];
      stackRef.current = next;
      setStack(next);
      if (prev) syncOverlayUrl(placeLayerHref(prev));
      return;
    }
    if (!beginCloseTop()) return;
    if (typeof window === 'undefined') return;
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

      // One sheet. Replies you open are a trail behind it, at the same
      // height, so action drawers stay above the icons.
      if (stackRef.current.length > 0) {
        const next: PostThreadLayerTarget = {
          id: `post-layer-${++seqRef.current}`,
          kind: 'post',
          accountId: parsed.accountId,
          postId: parsed.postId,
          root,
          zIndex: stackRef.current[0]?.zIndex ?? SHEET_Z.overlayHost,
        };
        const trail = [...stackRef.current, next];
        closingIdRef.current = null;
        setClosingId(null);
        stackRef.current = trail;
        setStack(trail);
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

  const openPostQuotes = useCallback(
    ({ href }: { href: string }) => {
      const parsed = parseInAppPostQuotesHref(href);
      if (!parsed) return false;
      const canonical = personalPostQuotesPath(parsed.accountId, parsed.postId);

      const top = stackRef.current[stackRef.current.length - 1];
      if (
        top?.kind === 'quotes' &&
        accountIdsEqual(top.accountId, parsed.accountId) &&
        top.postId === parsed.postId
      ) {
        return true;
      }

      const next: QuotesLayerTarget = {
        id: `quotes-layer-${++seqRef.current}`,
        kind: 'quotes',
        accountId: parsed.accountId,
        postId: parsed.postId,
        zIndex:
          stackRef.current[0]?.zIndex ??
          nextStackedLayerZ(stackRef.current),
      };

      if (stackRef.current.length > 0) {
        const trail = [...stackRef.current, next];
        closingIdRef.current = null;
        setClosingId(null);
        stackRef.current = trail;
        setStack(trail);
        if (typeof window === 'undefined') return true;
        getPostLayerPopGuard().depth = 1;
        const currentUrl = `${window.location.pathname}${window.location.search}`;
        if (currentUrl !== canonical) {
          nativeHistoryReplaceState(withPostLayerHistoryState(), canonical);
        }
        return true;
      }

      if (underlayPathRef.current == null) {
        underlayPathRef.current = pathname;
        setUnderlayPath(pathname);
        if (typeof window !== 'undefined') {
          underlayScrollRef.current = captureUnderlayScroll();
        }
      }
      closingIdRef.current = null;
      setClosingId(null);
      stackRef.current = [next];
      setStack([next]);

      if (typeof window === 'undefined') return true;
      getPostLayerPopGuard().depth = 1;
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (currentUrl === canonical) return true;
      nativeHistoryPushState(withPostLayerHistoryState(), canonical);
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
      const top = stackRef.current[stackRef.current.length - 1];
      if (!top) return;
      // This history entry is the reader. Leaving it drops the reply trail.
      if (stackRef.current.length > 1) {
        stackRef.current = [top];
        setStack([top]);
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
    if (!top || (top.kind !== 'post' && top.kind !== 'quotes')) return;
    nativeHistoryPushState(withPostLayerHistoryState(), placeLayerHref(top));
    getPostLayerPopGuard().depth = 1;
  }, [pathname, profileHop, stack, underlayPath]);

  const value = useMemo(
    () => ({
      openPostThread,
      openPostQuotes,
      openDrop,
      closePostThread,
    }),
    [closePostThread, openDrop, openPostQuotes, openPostThread]
  );

  const topPlace = stack[stack.length - 1] ?? null;
  const topOpen = topPlace != null && topPlace.id !== closingId;

  return (
    <PostThreadLayerContext.Provider value={value}>
      {children}
      {topPlace?.kind === 'drop' ? (
        <DropLayerSheet
          key="drop-reader"
          layer={topPlace}
          open={topOpen}
          onClose={closePostThread}
          onClosed={() => handleSheetClosed(topPlace.id)}
          zIndex={topPlace.zIndex}
          moodId={viewerMood.moodId ?? undefined}
          moodStyle={viewerMood.style}
        />
      ) : null}
      {topPlace?.kind === 'post' || topPlace?.kind === 'quotes' ? (
        <PostThreadSheet
          key="post-reader"
          layer={topPlace}
          parked={onProfileHop}
          onOpenProfile={openProfileFromLayer}
          open={topOpen}
          onClose={closePostThread}
          onClosed={() => handleSheetClosed(topPlace.id)}
          zIndex={topPlace.zIndex}
          moodId={viewerMood.moodId ?? undefined}
          moodStyle={viewerMood.style}
        />
      ) : null}
    </PostThreadLayerContext.Provider>
  );
}
