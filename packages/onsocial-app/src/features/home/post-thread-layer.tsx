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
import { usePathname } from 'next/navigation';
import type { PostRow } from '@onsocial/sdk';
import { ChevronLeftIcon, OsIconAction, OsPageSheet } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useViewerDockMood } from '@/hooks/use-viewer-dock-mood';
import { accountIdsEqual } from '@/lib/account-match';
import type { PersonalPostPageData } from '@/lib/load-personal-post-page';
import {
  canonicalizePostLayerHref,
  parseInAppPostLayerHref,
  personalPostPath,
} from '@/lib/post-routes';
import { SHEET_Z } from '@/lib/sheet-z';

const LivePersonalPostPanel = dynamic(
  () =>
    import('@/features/home/live-personal-post-panel').then(
      (mod) => mod.LivePersonalPostPanel
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
  accountId: string;
  postId: string;
  root: PostRow | null;
};

type PostThreadLayerValue = {
  openPostThread: (input: { href: string; root?: PostRow | null }) => boolean;
  closePostThread: () => void;
};

const PostThreadLayerContext = createContext<PostThreadLayerValue | null>(null);

const NOOP_LAYER: PostThreadLayerValue = {
  openPostThread: () => false,
  closePostThread: () => {},
};

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
    if (body.closest('.post-thread-sheet-panel')) continue;
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
  onClose,
  onClosed,
  zIndex,
  moodId,
  moodStyle,
}: {
  layer: PostThreadLayerTarget;
  open: boolean;
  onClose: () => void;
  onClosed: () => void;
  zIndex: number;
  moodId?: string;
  moodStyle?: CSSProperties;
}) {
  const titleId = useId();
  const initial = useMemo(
    () => (layer.root ? seedEmbeddedThread(layer.root) : null),
    [layer]
  );

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
      header={null}
    >
      <OsAppScreen
        title="Post"
        compactChrome
        glassChrome
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
        />
      </OsAppScreen>
    </OsPageSheet>
  );
}

export function PostThreadLayerProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const viewerMood = useViewerDockMood();
  const [stack, setStack] = useState<PostThreadLayerTarget[]>([]);
  const [closingId, setClosingId] = useState<string | null>(null);
  const pathnameAtOpenRef = useRef<string | null>(null);
  const underlayScrollRef = useRef<{ el: HTMLElement; top: number } | null>(
    null
  );
  const seqRef = useRef(0);
  const stackRef = useRef(stack);
  const closingIdRef = useRef<string | null>(closingId);
  useLayoutEffect(() => {
    stackRef.current = stack;
    closingIdRef.current = closingId;
  }, [closingId, stack]);

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
      syncOverlayUrl(personalPostPath(prev.accountId, prev.postId));
      return;
    }
    if (historyHasPostLayer()) {
      window.history.back();
      return;
    }
    nativeHistoryReplaceState(
      withoutPostLayerHistoryState(),
      pathnameAtOpenRef.current ?? '/home'
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
        top &&
        accountIdsEqual(top.accountId, parsed.accountId) &&
        top.postId === parsed.postId
      ) {
        return true;
      }

      const next: PostThreadLayerTarget = {
        id: `post-layer-${++seqRef.current}`,
        accountId: parsed.accountId,
        postId: parsed.postId,
        root,
      };
      if (pathnameAtOpenRef.current == null) {
        pathnameAtOpenRef.current = pathname;
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
    guard.depth = stack.length > 0 ? 1 : 0;
    guard.onPop = () => {
      const remaining = stackRef.current.slice(0, -1);
      const prev = remaining[remaining.length - 1];
      if (prev) {
        nativeHistoryPushState(
          withPostLayerHistoryState(),
          personalPostPath(prev.accountId, prev.postId)
        );
      }
      beginCloseTop();
    };
  }, [beginCloseTop, stack.length]);

  useEffect(() => {
    if (stack.length === 0) return;
    if (pathnameAtOpenRef.current == null) return;

    const locationHref =
      typeof window === 'undefined'
        ? pathname
        : `${window.location.pathname}${window.location.search}`;
    // pushState overlays can echo into Next on popstate. Stay on the stack
    // until the user actually leaves for another app route.
    if (
      parseInAppPostLayerHref(locationHref) ||
      parseInAppPostLayerHref(pathname)
    ) {
      return;
    }

    if (pathname !== pathnameAtOpenRef.current) {
      closingIdRef.current = null;
      setClosingId(null);
      setStack([]);
      pathnameAtOpenRef.current = null;
      if (typeof window !== 'undefined') {
        getPostLayerPopGuard().depth = 0;
      }
    }
  }, [pathname, stack.length]);

  const handleSheetClosed = useCallback((id: string) => {
    if (closingIdRef.current !== id) return;
    closingIdRef.current = null;
    setClosingId(null);
    setStack((prev) => {
      const next = prev.filter((layer) => layer.id !== id);
      if (next.length === 0) {
        pathnameAtOpenRef.current = null;
        const saved = underlayScrollRef.current;
        underlayScrollRef.current = null;
        if (saved?.el.isConnected) {
          saved.el.scrollTop = saved.top;
        }
      }
      if (typeof window !== 'undefined') {
        getPostLayerPopGuard().depth = next.length > 0 ? 1 : 0;
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ openPostThread, closePostThread }),
    [openPostThread, closePostThread]
  );

  return (
    <PostThreadLayerContext.Provider value={value}>
      {children}
      {stack.map((layer, index) => {
        const isTop = index === stack.length - 1;
        return (
          <PostThreadSheet
            key={layer.id}
            layer={layer}
            open={layer.id !== closingId}
            onClose={isTop ? closePostThread : () => {}}
            onClosed={() => handleSheetClosed(layer.id)}
            zIndex={SHEET_Z.overlayHost + index}
            moodId={viewerMood.moodId ?? undefined}
            moodStyle={viewerMood.style}
          />
        );
      })}
    </PostThreadLayerContext.Provider>
  );
}
