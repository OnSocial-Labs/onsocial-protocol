'use client';

import {
  createContext,
  Suspense,
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
import {
  ChevronLeftIcon,
  OsIconAction,
  GLASS_SHEET_MEDIA_FACE_LIFT,
  OsPageSheet,
  resolveGlassSheetZIndex,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { OsRouteSettle } from '@/components/app/os-route-settle';
import { useClaimDropSheetDockBack } from '@/contexts/dock-chrome-context';
import { PostQuotesTrackHostProvider } from '@/features/home/post-quotes-track-host';
import { PostQuotesPageSkeleton } from '@/features/home/post-quotes-skeleton';
import { PostThreadPageSkeleton } from '@/features/home/post-skeleton';
import type { CollectionCreatorFace } from '@/features/scarces/collection-creator-face';
import { editionTokenForCollection } from '@/features/scarces/collection-page-view';
import type { CollectionView } from '@/features/scarces/collections-data';
import { scarceEmbedsForOpenRoot } from '@/features/scarces/scarce-embed-ledger';
import { useViewerDockMood } from '@/hooks/use-viewer-dock-mood';
import { accountIdsEqual } from '@/lib/account-match';
import { portfolioSwipeOpensPage } from '@/lib/portfolio-feed-reveal';
import type { PersonalPostPageData } from '@/lib/load-personal-post-page';
import type { GuildPostPageData } from '@/lib/load-guild-post-page';
import type { PostQuotesPageData } from '@/lib/load-post-quotes-page';
import { seedQuotesFromSession } from '@/lib/quotes-session-cache';
import type { PostEngagement } from '@/hooks/use-post-engagement';
import {
  bumpMediaFaceCover,
  onDismissReplyDrawers,
  requestCloseMediaFaces,
  setMediaFacesHeld,
  setMediaFacesYielded,
} from '@/lib/media-face-session';
import {
  adoptAppLenisScroll,
  readAppScrollTop,
} from '@/lib/app-lenis-registry';
import { postKey } from '@/lib/post-display';
import {
  guildThreadCardContext,
  type ThreadSheetContext,
} from '@/lib/guild-thread-card-context';
import {
  canonicalizeDropLayerHref,
  COLLECTION_PASS_TOKEN_PARAM,
  collectionPath,
  parseInAppDropLayerHref,
} from '@/lib/app-routes';
import {
  canonicalizeGuildPostLayerHref,
  canonicalizePostLayerHref,
  parseGuildPostLayerHref,
  parseGuildPostQuotesHref,
  parseInAppPostLayerHref,
  parseInAppPostQuotesHref,
  personalPostPath,
  postQuotesPath,
  readPostQuotesTabFromHref,
  withPostQuotesTab,
  type PostQuotesTab,
} from '@/lib/post-routes';
import { guildPostPath } from '@/features/guilds/guilds-data';
import { POST_REACH_TITLE } from '@/lib/post-reach-title';
import {
  isOsMediaFaceOpen,
  nextPostLayerZIndex,
  postLayerOverlayZ,
  SHEET_Z,
} from '@/lib/sheet-z';
import { PostLayerOwnerZProvider } from '@/features/home/post-layer-owner-z';
import { seedPostAuthorProfilesFromFeed } from '@/hooks/use-post-author-profiles';
import {
  guildNameForThreadSeed,
  seedGuildDisplayNamesFromFeed,
} from '@/hooks/use-guild-display-names';
import { warmGuildChannelTitles } from '@/lib/guild-channel-titles';
import {
  threadContentPath,
  warmDropPanel,
  warmPostPanels,
  warmThreadOpen,
} from '@/lib/thread-first-page';
import {
  appendTrailEntry,
  collapseTrailToTop,
  replyOpenedOverMediaFace,
  isReaderLayerKind,
  isSameReaderTarget,
  revealTrailReader,
  replaceStackWith,
  retabTopQuotes,
  walkBackOneStep,
} from './post-thread-stack';
import {
  beginHistoryBack,
  dropLayerOpenHistoryOp,
  inFlightPopRepair,
  repairClosingLayerHistory,
  withoutClosingLayer,
} from './post-thread-history';

/*
 * Seeded feed opens already paint the root — never put a full-page skeleton
 * in `dynamic` `loading`. Cold opens keep the OsRouteSettle cover; chunk
 * suspend uses null (same as feed-media-thread-sheet) so a warm open does
 * not flash empty thread chrome.
 */
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

const LiveGuildPostPanel = dynamic(
  () =>
    import('@/features/guilds/live-guild-post-panel').then(
      (mod) => mod.LiveGuildPostPanel
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

/** Parked sheets must stay invisible even if a later rule fights the class. */
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
  /** Set for a guild thread. Personal posts leave this empty. */
  groupId: string | null;
  /** Feed the post was opened from, so the card can skip context already on screen. */
  context: ThreadSheetContext | null;
  root: PostRow | null;
  /**
   * Counts the tapped card already shows — seeds the sheet so the action row
   * never flashes zeros while the thread's own engagement fetch is in flight.
   */
  rootEngagement?: PostEngagement | null;
  zIndex: number;
  /** Glass lifts this sheet when a media face was already open. */
  openedAboveMediaFace: boolean;
};

function editionTokenFromDropHref(
  href: string,
  collectionId: string
): string | null {
  const q = href.indexOf('?');
  if (q < 0) return null;
  const hash = href.indexOf('#');
  const params = new URLSearchParams(
    href.slice(q + 1, hash < 0 ? undefined : hash)
  );
  const token = editionTokenForCollection(
    collectionId,
    params.get(COLLECTION_PASS_TOKEN_PARAM)
  );
  return token || null;
}

type DropLayerTarget = {
  id: string;
  kind: 'drop';
  collectionId: string;
  /** Cover/title seed — paints the drop shell before the indexer returns. */
  initial: CollectionView | null;
  /** List/feed creator face when already known — no account shimmer. */
  initialCreator: CollectionCreatorFace | null;
  /** `?t=` from the opener so #1 is on the first frame. */
  initialEditionToken: string | null;
  zIndex: number;
  openedAboveMediaFace: boolean;
};

type QuotesLayerTarget = {
  id: string;
  kind: 'quotes';
  accountId: string;
  postId: string;
  /** Set for a guild thread. Personal posts leave this empty. */
  groupId: string | null;
  tab: PostQuotesTab;
  /** Thread/session seed — paints root + quotes before the network returns. */
  initial: PostQuotesPageData | null;
  zIndex: number;
  openedAboveMediaFace: boolean;
};

type PlaceLayerTarget =
  | PostThreadLayerTarget
  | DropLayerTarget
  | QuotesLayerTarget;

type ReaderLayerTarget = PostThreadLayerTarget | QuotesLayerTarget;

type PostThreadLayerValue = {
  openPostThread: (input: {
    href: string;
    root?: PostRow | null;
    context?: ThreadSheetContext | null;
    rootEngagement?: PostEngagement | null;
    /**
     * This post sits above the one on screen (an ancestor). Show it again
     * like a feed open. Do not push another sheet on top of the reply.
     */
    returnToPost?: boolean;
  }) => boolean;
  openPostQuotes: (input: {
    href: string;
    root?: PostRow | null;
    rootEngagement?: PostEngagement | null;
  }) => boolean;
  openDrop: (input: {
    href: string;
    initial?: CollectionView | null;
    initialCreator?: CollectionCreatorFace | null;
  }) => boolean;
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
  return portfolioSwipeOpensPage(href);
}

function isOverlayPlacePathname(pathname: string): boolean {
  return (
    parseInAppPostLayerHref(pathname) != null ||
    parseInAppDropLayerHref(pathname) != null
  );
}

function topOpenMediaFaceZ(): number | null {
  if (typeof document === 'undefined') return null;
  let top: number | null = null;
  document
    .querySelectorAll<HTMLElement>(
      '[data-os-slide-over="true"]:not(.is-closing)'
    )
    .forEach((node) => {
      const z = Number(getComputedStyle(node).zIndex);
      if (!Number.isFinite(z)) return;
      top = top == null ? z : Math.max(top, z);
    });
  return top;
}

function nextStackedLayerZ(stack: PlaceLayerTarget[]): number {
  const top = stack[stack.length - 1];
  return nextPostLayerZIndex(top?.zIndex ?? null, isOsMediaFaceOpen());
}

function placeLayerHref(layer: PlaceLayerTarget): string {
  if (layer.kind === 'drop') return collectionPath(layer.collectionId);
  if (layer.kind === 'quotes') {
    return withPostQuotesTab(
      postQuotesPath({
        accountId: layer.accountId,
        postId: layer.postId,
        groupId: layer.groupId,
      }),
      layer.tab
    );
  }
  if (layer.groupId) {
    return guildPostPath(layer.groupId, layer.accountId, layer.postId);
  }
  return personalPostPath(layer.accountId, layer.postId);
}

function seedGuildThread(
  root: PostRow,
  rootEngagement?: PostEngagement | null
): GuildPostPageData {
  return {
    root,
    replies: [],
    quotes: [],
    replyTree: [],
    hasMoreReplies: false,
    guildName: guildNameForThreadSeed(root),
    memberDriven: false,
    accessGated: false,
    engagement: rootEngagement ? { [postKey(root)]: rootEngagement } : {},
    scarceEmbeds: scarceEmbedsForOpenRoot(root),
  };
}

function seedEmbeddedThread(
  root: PostRow,
  rootEngagement?: PostEngagement | null
): PersonalPostPageData {
  return {
    root,
    replies: [],
    quotes: [],
    replyTree: [],
    hasMoreReplies: false,
    engagement: rootEngagement ? { [postKey(root)]: rootEngagement } : {},
    scarceEmbeds: scarceEmbedsForOpenRoot(root),
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
    if (body.closest('.post-thread-sheet-panel, .drop-sheet-panel')) {
      continue;
    }
    return { el: body, top: readAppScrollTop(body) };
  }
  return null;
}

/** Put the underlay back where capture left it — native + Lenis together. */
function restoreUnderlayScroll(saved: { el: HTMLElement; top: number }): void {
  if (!saved.el.isConnected) return;
  saved.el.scrollTop = saved.top;
  adoptAppLenisScroll(saved.el);
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
  const quotes = layer.kind === 'quotes';
  const [quotesTrackHost, setQuotesTrackHost] = useState<HTMLDivElement | null>(
    null
  );
  // Settle waits on paint (`onThreadPainted`); key so a new layer never
  // inherits the previous ready frame. A root already on the feed starts
  // painted — the sheet appear is the motion, and replies skeleton below.
  const layerKey = `${layer.kind}:${layer.groupId ?? ''}:${layer.accountId}:${layer.postId}${
    layer.kind === 'quotes' ? `:${layer.tab}` : ''
  }`;
  const seededRoot =
    (layer.kind === 'post' && layer.root != null) ||
    (layer.kind === 'quotes' && layer.initial?.root != null);
  const [paintedForKey, setPaintedForKey] = useState<string | null>(() =>
    seededRoot ? layerKey : null
  );
  const threadPainted = paintedForKey === layerKey;
  const title = quotes ? POST_REACH_TITLE : 'Post';
  const guildCard =
    layer.kind === 'post' && layer.groupId
      ? guildThreadCardContext({
          groupId: layer.groupId,
          postChannel: layer.root?.channel,
          openedFrom: layer.context,
        })
      : null;
  const initial = useMemo(
    () =>
      layer.kind === 'post' && layer.root
        ? seedEmbeddedThread(layer.root, layer.rootEngagement)
        : null,
    [layer]
  );
  const noteThreadPainted = useCallback(() => {
    setPaintedForKey(layerKey);
  }, [layerKey]);

  useLayoutEffect(() => {
    if (!parked) return;
    ensurePostThreadParkedStyle();
    // Class + inject hide the root. Here: inert, hush media, scroll isolation.
    let hushed = false;
    let sheetRoot: HTMLElement | null = null;
    const hush = (node: HTMLMediaElement) => {
      if (node.paused || node.ended) return;
      node.pause();
    };
    const quiet = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLMediaElement)) return;
      hush(target);
      window.setTimeout(() => hush(target), 0);
    };
    const allowScroll = (event: Event) => {
      const target = event.target;
      if (!(sheetRoot instanceof HTMLElement) || !(target instanceof Node)) {
        return;
      }
      if (!sheetRoot.contains(target)) return;
      event.stopPropagation();
    };
    const apply = () => {
      const root = bodyRef.current?.closest('.glass-sheet-root');
      if (!(root instanceof HTMLElement)) return;
      sheetRoot = root;
      root.setAttribute('aria-hidden', 'true');
      root.inert = true;
      if (hushed) return;
      hushed = true;
      root.querySelectorAll('video, audio').forEach((node) => {
        if (!(node instanceof HTMLMediaElement)) return;
        hush(node);
        window.setTimeout(() => hush(node), 0);
      });
      root.addEventListener('play', quiet, true);
    };
    apply();
    // Portal remount only — not every feed mutation.
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true });
    window.addEventListener('wheel', allowScroll, true);
    window.addEventListener('touchmove', allowScroll, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('wheel', allowScroll, true);
      window.removeEventListener('touchmove', allowScroll, true);
      const root = sheetRoot;
      if (root instanceof HTMLElement) {
        root.removeEventListener('play', quiet, true);
        root.removeAttribute('aria-hidden');
        root.inert = false;
      }
    };
  }, [parked]);

  // Same as main: a new layer opens at scroll 0 (land re-pins posts after).
  useLayoutEffect(() => {
    const screen = bodyRef.current?.querySelector('.os-app-screen-body');
    if (!(screen instanceof HTMLElement)) return;
    screen.scrollTop = 0;
    adoptAppLenisScroll(screen);
  }, [layer.accountId, layer.kind, layer.postId]);

  // Quotes scroll in nested page roots (body is overflow:hidden). Reset once
  // the list paints — Lenis can otherwise keep a stale mid-list target.
  useLayoutEffect(() => {
    if (layer.kind !== 'quotes' || !threadPainted) return;
    const fill = bodyRef.current;
    if (!fill) return;
    for (const node of fill.querySelectorAll('.post-quotes-page-scroll')) {
      if (!(node instanceof HTMLElement)) continue;
      node.scrollTop = 0;
      adoptAppLenisScroll(node);
    }
  }, [layer.accountId, layer.kind, layer.postId, threadPainted]);

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

  const renderedZ = resolveGlassSheetZIndex(zIndex, layer.openedAboveMediaFace);

  return (
    <PostLayerOwnerZProvider value={renderedZ}>
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
        panelClassName="post-thread-sheet-panel os-page-chrome-appear"
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
            nestedScrollChrome={quotes}
            className={quotes ? 'post-quotes-screen-chrome' : undefined}
            toolbar={
              quotes ? (
                <div
                  className="post-quotes-track-slot"
                  ref={setQuotesTrackHost}
                />
              ) : undefined
            }
            heading={
              <span id={titleId} className="os-app-screen-title">
                {title}
              </span>
            }
            leading={
              <OsIconAction ariaLabel="Back" onClick={onClose}>
                <ChevronLeftIcon
                  className="glass-sheet-close-icon"
                  aria-hidden
                />
              </OsIconAction>
            }
          >
            <OsRouteSettle
              ready={threadPainted}
              skeleton={
                quotes ? <PostQuotesPageSkeleton /> : <PostThreadPageSkeleton />
              }
            >
              <PostQuotesTrackHostProvider
                value={quotes ? quotesTrackHost : null}
              >
                <Suspense fallback={null}>
                  {layer.kind === 'quotes' ? (
                    <PostQuotesPanel
                      key={`${layer.groupId ?? ''}:${layer.accountId}:${layer.postId}:${layer.tab}`}
                      author={layer.accountId}
                      postId={layer.postId}
                      initial={layer.initial}
                      embedded
                      initialTab={layer.tab}
                      onThreadPainted={noteThreadPainted}
                    />
                  ) : layer.groupId ? (
                    <LiveGuildPostPanel
                      key={`${layer.groupId}:${layer.accountId}:${layer.postId}`}
                      groupId={layer.groupId}
                      author={layer.accountId}
                      postId={layer.postId}
                      initial={
                        layer.root
                          ? seedGuildThread(layer.root, layer.rootEngagement)
                          : null
                      }
                      embedded
                      replyDockEnabled={open && !parked}
                      parked={parked}
                      showGuildLine={guildCard?.showGuildLine ?? true}
                      showChannel={guildCard?.showChannel ?? true}
                      sheetContext={layer.context}
                      onThreadPainted={noteThreadPainted}
                    />
                  ) : (
                    <LivePersonalPostPanel
                      key={`${layer.accountId}:${layer.postId}`}
                      author={layer.accountId}
                      postId={layer.postId}
                      initial={initial}
                      embedded
                      replyDockEnabled={open && !parked}
                      parked={parked}
                      onThreadPainted={noteThreadPainted}
                    />
                  )}
                </Suspense>
              </PostQuotesTrackHostProvider>
            </OsRouteSettle>
          </OsAppScreen>
        </div>
      </OsPageSheet>
    </PostLayerOwnerZProvider>
  );
}

function DropLayerSheet({
  layer,
  open,
  parked,
  onClose,
  onClosed,
  onLeave,
  zIndex,
  moodId,
  moodStyle,
}: {
  layer: DropLayerTarget;
  open: boolean;
  /** Profile, door, or another route is the screen. Keep the drop mounted. */
  parked: boolean;
  onClose: () => void;
  onClosed: () => void;
  onLeave: (href: string) => void;
  zIndex: number;
  moodId?: string;
  moodStyle?: CSSProperties;
}) {
  const titleId = useId();
  const renderedZ = resolveGlassSheetZIndex(zIndex, layer.openedAboveMediaFace);
  const leaveFromDrop = (event: ReactMouseEvent) => {
    if (!isUnmodifiedPrimaryClick(event)) return;
    const node = event.target;
    if (!(node instanceof Element)) return;
    const anchor = node.closest('a');
    if (!(anchor instanceof HTMLAnchorElement)) return;
    if (anchor.target === '_blank') return;
    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('#') || /^https?:/i.test(href)) return;
    const path = href.split(/[?#]/)[0] ?? href;
    if (!path.startsWith('/')) return;
    // Another drop stays in this sheet. Everything else parks and navigates.
    if (parseInAppDropLayerHref(path)) return;
    event.preventDefault();
    event.stopPropagation();
    onLeave(href);
  };
  return (
    <PostLayerOwnerZProvider value={renderedZ}>
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
        lockScroll={!parked}
        moodId={moodId}
        moodStyle={moodStyle}
        panelClassName="drop-sheet-panel"
        bodyClassName="drop-sheet-body"
        rootClassName={parked ? 'post-thread-sheet-parked' : undefined}
        header={null}
      >
        <div className="drop-sheet-fill" onClickCapture={leaveFromDrop}>
          <span id={titleId} className="sr-only">
            Drop
          </span>
          <CollectionPagePanel
            key={layer.collectionId}
            collectionId={layer.collectionId}
            initial={layer.initial}
            initialCreator={layer.initialCreator}
            initialEditionToken={layer.initialEditionToken}
            embedded
            suspendDock={parked}
            onClose={onClose}
          />
        </div>
      </OsPageSheet>
    </PostLayerOwnerZProvider>
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
  /** `history.back()` from a close whose popstate has not landed yet. */
  const closePopPendingRef = useRef(false);
  /** Canonical of the layer that replaced a close, query included. */
  const overlayCanonicalRef = useRef<string | null>(null);
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

  const mediaFaceCovered =
    stack.some((entry) => entry.id !== closingId) && isOsMediaFaceOpen();

  // Prefetch thread chunks on mount so a cold first open is not download-bound.
  useEffect(() => {
    warmPostPanels();
    warmDropPanel();
  }, []);

  useLayoutEffect(() => {
    setMediaFacesHeld(mediaFaceCovered);
    return () => {
      if (mediaFaceCovered) setMediaFacesHeld(false);
    };
  }, [mediaFaceCovered]);

  // A later reply can cover a film that was already held. Re-check heights.
  useLayoutEffect(() => {
    if (!mediaFaceCovered) return;
    bumpMediaFaceCover();
  }, [mediaFaceCovered, stack]);

  // Leaving the post ends the aside. The film is no longer waiting.
  useEffect(() => {
    if (stack.length > 0) return;
    setMediaFacesYielded(false);
  }, [stack.length]);

  // A cover tap chose the film. The reply trail closes. Back does not.
  useEffect(() => {
    return onDismissReplyDrawers(() => {
      const underlay = underlayPathRef.current ?? '/home';
      const saved = underlayScrollRef.current;
      setMediaFacesHeld(false);
      if (stackRef.current.length === 0) return;
      closingIdRef.current = null;
      setClosingId(null);
      stackRef.current = [];
      setStack([]);
      underlayPathRef.current = null;
      setUnderlayPath(null);
      underlayScrollRef.current = null;
      if (saved) restoreUnderlayScroll(saved);
      if (typeof window === 'undefined') return;
      getPostLayerPopGuard().depth = 0;
      if (historyHasPostLayer()) {
        nativeHistoryReplaceState(withoutPostLayerHistoryState(), underlay);
      }
    });
  }, []);

  const beginCloseTop = useCallback(() => {
    const top = stackRef.current[stackRef.current.length - 1];
    if (!top || closingIdRef.current) return false;
    closingIdRef.current = top.id;
    setClosingId(top.id);
    return true;
  }, []);

  /*
   * Reply dock for the live sheet. A normal post stays under the constant
   * dock band (51). A sheet lifted over a media face publishes a dock above
   * that sheet and above a cover opened from it.
   */
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    const top = stack[stack.length - 1];
    const live =
      top != null &&
      top.kind !== 'drop' &&
      top.id !== closingId &&
      !onProfileHop;
    const rendered = live
      ? resolveGlassSheetZIndex(top.zIndex, top.openedAboveMediaFace)
      : null;
    const dock = postLayerOverlayZ(rendered).dock;
    if (dock != null) {
      document.body.style.setProperty('--os-thread-dock-z', String(dock));
    } else {
      document.body.style.removeProperty('--os-thread-dock-z');
    }
    return () => {
      document.body.style.removeProperty('--os-thread-dock-z');
    };
  }, [closingId, onProfileHop, stack]);

  const syncOverlayUrl = useCallback((href: string) => {
    if (typeof window === 'undefined') return;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl === href) return;
    nativeHistoryReplaceState(withPostLayerHistoryState(), href);
  }, []);

  const closePostThread = useCallback(() => {
    const current = stackRef.current;
    // The film comes back with this step, including the last sheet.
    setMediaFacesYielded(false);
    // The sheet stays up until the last step.
    const walked = walkBackOneStep(current);
    if (walked) {
      const prev = walked[walked.length - 1];
      stackRef.current = walked;
      setStack(walked);
      if (prev) syncOverlayUrl(placeLayerHref(prev));
      return;
    }
    if (!beginCloseTop()) return;
    if (typeof window === 'undefined') return;
    const closing = current[current.length - 1];
    const underlay = underlayPathRef.current ?? '/home';
    // Drop from home replaced the root — replace back (no stacked entry).
    // Drop over a real page pushed — history.back restores that page.
    if (
      closing?.kind === 'drop' &&
      dropLayerOpenHistoryOp(underlay) === 'replace'
    ) {
      getPostLayerPopGuard().depth = 0;
      nativeHistoryReplaceState(withoutPostLayerHistoryState(), underlay);
      return;
    }
    const back = beginHistoryBack({
      depth: getPostLayerPopGuard().depth,
      historyHasLayer: historyHasPostLayer(),
    });
    if (back.back) {
      closePopPendingRef.current = back.armPending;
      window.history.back();
      return;
    }
    nativeHistoryReplaceState(withoutPostLayerHistoryState(), underlay);
  }, [beginCloseTop, syncOverlayUrl]);

  const publishClosingHistory = useCallback((canonical: string) => {
    if (typeof window === 'undefined') return;
    overlayCanonicalRef.current = canonical;
    const guard = getPostLayerPopGuard();
    guard.depth = 1;
    const action = repairClosingLayerHistory({
      canonical,
      currentUrl: `${window.location.pathname}${window.location.search}`,
      historyHasLayer: historyHasPostLayer(),
    });
    if (action.op === 'push') {
      nativeHistoryPushState(withPostLayerHistoryState(), action.href);
    } else if (action.op === 'replace') {
      nativeHistoryReplaceState(withPostLayerHistoryState(), action.href);
    }
  }, []);

  const openPostThread = useCallback(
    ({
      href,
      root = null,
      context = null,
      rootEngagement = null,
      returnToPost = false,
    }: {
      href: string;
      root?: PostRow | null;
      context?: ThreadSheetContext | null;
      rootEngagement?: PostEngagement | null;
      returnToPost?: boolean;
    }) => {
      const personal = parseInAppPostLayerHref(href);
      const guild = personal ? null : parseGuildPostLayerHref(href);
      const parsed = personal
        ? {
            accountId: personal.accountId,
            postId: personal.postId,
            groupId: null as string | null,
          }
        : guild
          ? {
              accountId: guild.accountId,
              postId: guild.postId,
              groupId: guild.groupId,
            }
          : null;
      if (!parsed) return false;
      if (root) {
        // Feed already painted this face — keep it for the sheet's first frame.
        seedPostAuthorProfilesFromFeed([root], { notify: true });
        seedGuildDisplayNamesFromFeed([root], { notify: true });
      }
      warmThreadOpen(
        threadContentPath(parsed),
        parsed.groupId ? 'guild' : 'personal'
      );
      if (parsed.groupId) warmGuildChannelTitles(parsed.groupId);
      const canonical = personal
        ? canonicalizePostLayerHref(href)
        : canonicalizeGuildPostLayerHref(href);
      if (!canonical) return false;

      const personalPage = parseInAppPostLayerHref(pathname);
      const guildPage = personalPage ? null : parseGuildPostLayerHref(pathname);
      const currentPage = personalPage
        ? {
            accountId: personalPage.accountId,
            postId: personalPage.postId,
            groupId: null as string | null,
          }
        : guildPage;
      if (
        currentPage &&
        (currentPage.groupId ?? null) === parsed.groupId &&
        accountIdsEqual(currentPage.accountId, parsed.accountId) &&
        currentPage.postId === parsed.postId &&
        stackRef.current.length === 0
      ) {
        return true;
      }

      const revealed = revealTrailReader(stackRef.current, {
        kind: 'post',
        ...parsed,
      });
      if (revealed?.at === 'top') {
        if (topOpenMediaFaceZ() != null) {
          // Already this post. Step the film aside. Its pause starts the launcher.
          setMediaFacesYielded(true);
        } else {
          requestCloseMediaFaces();
        }
        return true;
      }
      if (revealed?.at === 'back') {
        closingIdRef.current = null;
        setClosingId(null);
        stackRef.current = revealed.stack;
        setStack(revealed.stack);
        requestCloseMediaFaces();
        if (typeof window === 'undefined') return true;
        getPostLayerPopGuard().depth = 1;
        const currentUrl = `${window.location.pathname}${window.location.search}`;
        if (currentUrl !== canonical) {
          nativeHistoryReplaceState(withPostLayerHistoryState(), canonical);
        }
        return true;
      }

      // An ancestor is not a new step. One sheet, the same as the feed.
      if (returnToPost && stackRef.current.length > 0) {
        const only: PostThreadLayerTarget = {
          id: `post-layer-${++seqRef.current}`,
          kind: 'post',
          accountId: parsed.accountId,
          postId: parsed.postId,
          groupId: parsed.groupId,
          context,
          root,
          rootEngagement,
          zIndex: nextPostLayerZIndex(null, false),
          openedAboveMediaFace: false,
        };
        closingIdRef.current = null;
        setClosingId(null);
        stackRef.current = [only];
        setStack([only]);
        requestCloseMediaFaces();
        if (typeof window === 'undefined') return true;
        getPostLayerPopGuard().depth = 1;
        const currentUrl = `${window.location.pathname}${window.location.search}`;
        if (currentUrl !== canonical) {
          nativeHistoryReplaceState(withPostLayerHistoryState(), canonical);
        }
        return true;
      }

      // One sheet. Replies you open are a trail behind it, at the same
      // height, so action drawers stay above the icons.
      // A layer still playing its close is not a parent. Leaving it in the
      // stack and clearing `closingId` mounts it again under the new post.
      const liveStack = withoutClosingLayer(
        stackRef.current,
        closingIdRef.current
      );
      const droppedClosing = liveStack !== stackRef.current;

      if (liveStack.length > 0) {
        const placed = replyOpenedOverMediaFace({
          trailZ: liveStack[0]?.zIndex ?? SHEET_Z.overlayHost,
          mediaFaceZ: topOpenMediaFaceZ(),
          lift: GLASS_SHEET_MEDIA_FACE_LIFT,
        });
        const next: PostThreadLayerTarget = {
          id: `post-layer-${++seqRef.current}`,
          kind: 'post',
          accountId: parsed.accountId,
          postId: parsed.postId,
          groupId: parsed.groupId,
          context,
          root,
          rootEngagement,
          zIndex: placed.zIndex,
          openedAboveMediaFace: placed.openedAboveMediaFace,
        };
        const trail = appendTrailEntry(liveStack, next);
        closingIdRef.current = null;
        setClosingId(null);
        stackRef.current = trail;
        setStack(trail);
        // The film stays up under this reply. Back returns to it.
        if (typeof window === 'undefined') return true;
        if (droppedClosing) {
          publishClosingHistory(canonical);
          return true;
        }
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
        groupId: parsed.groupId,
        context,
        root,
        rootEngagement,
        zIndex: nextStackedLayerZ(liveStack),
        openedAboveMediaFace: isOsMediaFaceOpen(),
      };
      if (underlayPathRef.current == null) {
        underlayPathRef.current = pathname;
        setUnderlayPath(pathname);
        if (typeof window !== 'undefined') {
          underlayScrollRef.current = captureUnderlayScroll();
        }
      }
      const isFirst = !droppedClosing && stackRef.current.length === 0;
      closingIdRef.current = null;
      setClosingId(null);
      if (droppedClosing) {
        const opened = [next];
        stackRef.current = opened;
        setStack(opened);
      } else {
        setStack((prev) => [...prev, next]);
      }

      if (typeof window === 'undefined') return true;
      getPostLayerPopGuard().depth = 1;
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (droppedClosing) {
        publishClosingHistory(canonical);
        return true;
      }
      if (currentUrl === canonical) return true;
      if (isFirst) {
        nativeHistoryPushState(withPostLayerHistoryState(), canonical);
      } else {
        nativeHistoryReplaceState(withPostLayerHistoryState(), canonical);
      }
      return true;
    },
    [pathname, publishClosingHistory]
  );

  const openPostQuotes = useCallback(
    ({
      href,
      root = null,
      rootEngagement = null,
    }: {
      href: string;
      root?: PostRow | null;
      rootEngagement?: PostEngagement | null;
    }) => {
      const personal = parseInAppPostQuotesHref(href);
      const guild = personal ? null : parseGuildPostQuotesHref(href);
      const parsed = personal
        ? {
            accountId: personal.accountId,
            postId: personal.postId,
            groupId: null as string | null,
          }
        : guild
          ? {
              accountId: guild.accountId,
              postId: guild.postId,
              groupId: guild.groupId,
            }
          : null;
      if (!parsed) return false;
      const tab = readPostQuotesTabFromHref(href);
      const canonical = withPostQuotesTab(
        postQuotesPath({
          accountId: parsed.accountId,
          postId: parsed.postId,
          groupId: parsed.groupId,
        }),
        tab
      );

      const liveStack = withoutClosingLayer(
        stackRef.current,
        closingIdRef.current
      );
      const droppedClosing = liveStack !== stackRef.current;
      const top = liveStack[liveStack.length - 1];
      if (top && isSameReaderTarget(top, { kind: 'quotes', ...parsed })) {
        if (top.kind === 'quotes' && top.tab !== tab) {
          const trail = retabTopQuotes(liveStack, tab);
          stackRef.current = trail;
          setStack(trail);
          if (typeof window !== 'undefined') {
            const currentUrl = `${window.location.pathname}${window.location.search}`;
            if (currentUrl !== canonical) {
              nativeHistoryReplaceState(withPostLayerHistoryState(), canonical);
            }
          }
        }
        return true;
      }

      const next: QuotesLayerTarget = {
        id: `quotes-layer-${++seqRef.current}`,
        kind: 'quotes',
        accountId: parsed.accountId,
        postId: parsed.postId,
        groupId: parsed.groupId,
        tab,
        initial: seedQuotesFromSession({
          accountId: parsed.accountId,
          postId: parsed.postId,
          groupId: parsed.groupId,
          root,
          rootEngagement,
        }),
        zIndex: liveStack[0]?.zIndex ?? nextStackedLayerZ(liveStack),
        openedAboveMediaFace: isOsMediaFaceOpen(),
      };

      if (liveStack.length > 0) {
        const trail = appendTrailEntry(liveStack, next);
        closingIdRef.current = null;
        setClosingId(null);
        stackRef.current = trail;
        setStack(trail);
        if (typeof window === 'undefined') return true;
        if (droppedClosing) {
          publishClosingHistory(canonical);
          return true;
        }
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
      if (droppedClosing) {
        publishClosingHistory(canonical);
        return true;
      }
      getPostLayerPopGuard().depth = 1;
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (currentUrl === canonical) return true;
      nativeHistoryPushState(withPostLayerHistoryState(), canonical);
      return true;
    },
    [pathname, publishClosingHistory]
  );

  const openDrop = useCallback(
    ({
      href,
      initial = null,
      initialCreator = null,
    }: {
      href: string;
      initial?: CollectionView | null;
      initialCreator?: CollectionCreatorFace | null;
    }) => {
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

      const liveStack = withoutClosingLayer(
        stackRef.current,
        closingIdRef.current
      );
      const droppedClosing = liveStack !== stackRef.current;
      const top = liveStack[liveStack.length - 1];
      if (
        top?.kind === 'drop' &&
        collectionIdsEqual(top.collectionId, parsed.collectionId)
      ) {
        return true;
      }

      const seeded =
        initial && collectionIdsEqual(initial.collectionId, parsed.collectionId)
          ? initial
          : null;
      const seededCreator = seeded ? (initialCreator ?? null) : null;

      const nextDrop = (): DropLayerTarget => ({
        id: `drop-layer-${++seqRef.current}`,
        kind: 'drop',
        collectionId: parsed.collectionId,
        initial: seeded,
        initialCreator: seededCreator,
        initialEditionToken: editionTokenFromDropHref(
          href,
          parsed.collectionId
        ),
        zIndex: liveStack[0]?.zIndex ?? nextStackedLayerZ(liveStack),
        openedAboveMediaFace: isOsMediaFaceOpen(),
      });

      if (liveStack.length > 0) {
        const next = nextDrop();
        const replacement = replaceStackWith(next);
        closingIdRef.current = null;
        setClosingId(null);
        stackRef.current = replacement;
        setStack(replacement);
        if (typeof window === 'undefined') return true;
        if (droppedClosing) {
          publishClosingHistory(canonical);
          return true;
        }
        getPostLayerPopGuard().depth = 1;
        const currentUrl = `${window.location.pathname}${window.location.search}`;
        if (currentUrl !== canonical) {
          nativeHistoryReplaceState(withPostLayerHistoryState(), canonical);
        }
        return true;
      }

      const next = nextDrop();
      if (underlayPathRef.current == null) {
        underlayPathRef.current = pathname;
        setUnderlayPath(pathname);
        if (typeof window !== 'undefined') {
          underlayScrollRef.current = captureUnderlayScroll();
        }
      }
      const isFirst = !droppedClosing && stackRef.current.length === 0;
      closingIdRef.current = null;
      setClosingId(null);
      if (droppedClosing) {
        stackRef.current = [next];
        setStack([next]);
      } else {
        setStack((prev) => [...prev, next]);
      }

      if (typeof window === 'undefined') return true;
      if (droppedClosing) {
        publishClosingHistory(canonical);
        return true;
      }
      // First open: push over a real underlay page so browser Back dismisses;
      // replace on home so root open/close does not stack. Later swaps replace.
      const syncCanonical = () => {
        getPostLayerPopGuard().depth = 1;
        const currentUrl = `${window.location.pathname}${window.location.search}`;
        if (currentUrl === canonical) return;
        const underlay = underlayPathRef.current ?? pathname;
        const op = isFirst
          ? dropLayerOpenHistoryOp(underlay)
          : 'replace';
        if (op === 'push') {
          nativeHistoryPushState(withPostLayerHistoryState(), canonical);
        } else {
          nativeHistoryReplaceState(withPostLayerHistoryState(), canonical);
        }
      };
      if (isFirst) {
        queueMicrotask(syncCanonical);
      } else {
        syncCanonical();
      }
      return true;
    },
    [pathname, publishClosingHistory]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const guard = getPostLayerPopGuard();
    guard.depth = stack.length > 0 && !profileHop ? 1 : 0;
    guard.onPop = () => {
      const pendingClosePop = closePopPendingRef.current;
      closePopPendingRef.current = false;
      // Back already started closing a layer, then a new one replaced it
      // before this pop landed. That pop belongs to the layer we dropped.
      const repair = inFlightPopRepair({
        pendingClosePop,
        closingId: closingIdRef.current,
        stackLength: stackRef.current.length,
        historyHasLayer: historyHasPostLayer(),
        canonical: overlayCanonicalRef.current,
      });
      if (repair.swallow) {
        if (repair.pushHref) {
          nativeHistoryPushState(withPostLayerHistoryState(), repair.pushHref);
        }
        guard.depth = 1;
        return;
      }
      const top = stackRef.current[stackRef.current.length - 1];
      if (!top) return;
      // This history entry is the reader. Leaving it drops the reply trail.
      if (stackRef.current.length > 1) {
        const collapsed = collapseTrailToTop(stackRef.current);
        stackRef.current = collapsed;
        setStack(collapsed);
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
      if (saved) restoreUnderlayScroll(saved);
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
    if (!top || !isReaderLayerKind(top.kind)) return;
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
  const dropDockLive = topPlace?.kind === 'drop' && topOpen && !onProfileHop;
  useClaimDropSheetDockBack(
    dropDockLive,
    dropDockLive
      ? {
          fallbackHref: underlayPath ?? '/home',
          ariaLabel: 'Back',
          onBack: closePostThread,
        }
      : null
  );

  return (
    <PostThreadLayerContext.Provider value={value}>
      {children}
      {topPlace?.kind === 'drop' ? (
        <DropLayerSheet
          key="drop-reader"
          layer={topPlace}
          parked={onProfileHop}
          open={topOpen}
          onClose={closePostThread}
          onClosed={() => handleSheetClosed(topPlace.id)}
          onLeave={openProfileFromLayer}
          zIndex={topPlace.zIndex}
          moodId={viewerMood.moodId ?? undefined}
          moodStyle={viewerMood.style}
        />
      ) : null}
      {stack.map((entry) => {
        if (entry.kind !== 'post' && entry.kind !== 'quotes') return null;
        // Trail entries below the top stay mounted (parked), so header back
        // unparks the previous panel with its scroll, sort, and fold state
        // intact instead of remounting it.
        const isTop = entry.id === topPlace?.id;
        return (
          <PostThreadSheet
            key={entry.id}
            layer={entry}
            parked={onProfileHop || !isTop}
            onOpenProfile={openProfileFromLayer}
            open={entry.id !== closingId}
            onClose={closePostThread}
            onClosed={() => handleSheetClosed(entry.id)}
            zIndex={entry.zIndex}
            moodId={viewerMood.moodId ?? undefined}
            moodStyle={viewerMood.style}
          />
        );
      })}
    </PostThreadLayerContext.Provider>
  );
}
