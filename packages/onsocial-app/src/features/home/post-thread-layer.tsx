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
import {
  useClaimDropSheetDockBack,
  useClaimPlaceLayerDockBack,
} from '@/contexts/dock-chrome-context';
import { PostQuotesTrackHostProvider } from '@/features/home/post-quotes-track-host';
import { PostQuotesPageSkeleton } from '@/features/home/post-quotes-skeleton';
import { PostThreadPageSkeleton } from '@/features/home/post-skeleton';
import type { CollectionCreatorFace } from '@/features/scarces/collection-creator-face';
import { DropLayerPanelPending } from '@/features/scarces/drop-layer-panel-pending';
import { editionTokenForCollection } from '@/features/scarces/collection-page-view';
import type { CollectionView } from '@/features/scarces/collections-data';
import { scarceEmbedsForOpenRoot } from '@/features/scarces/scarce-embed-ledger';
import { directRepliesToTree } from '@/lib/thread-first-page';
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
  setOsDropSheetOpen,
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
  ensurePostPanelChunk,
  threadContentPath,
  warmDropPanel,
  warmFeedOpenChunks,
  warmQuotesOpen,
  warmThreadOpen,
} from '@/lib/thread-first-page';
import {
  alignPlaceHistory,
  applyPlaceTrailHistory,
  schedulePlaceHistoryGo,
  beginHistoryBack,
  getPlaceHistoryGuard,
  historyHasPlaceLayer,
  inFlightPopRepair,
  nativeHistoryPushState,
  nativeHistoryReplaceState,
  pushPlaceLayer,
  readPlaceLayerDepth,
  repairClosingLayerHistory,
  replacePlaceLayer,
  withPlaceLayerHistoryState,
  withoutClosingLayer,
  withoutPlaceLayerHistoryState,
} from '@/lib/place-history';
import {
  appendTrailEntry,
  replyOpenedOverMediaFace,
  isReaderLayerKind,
  isSameReaderTarget,
  revealTrailReader,
  replaceStackWith,
  retabTopQuotes,
  walkBackOneStep,
} from './post-thread-stack';

/*
 * Seeded feed opens already paint the root — never put a full-page skeleton
 * in `dynamic` `loading` for post/quotes. Cold opens keep the OsRouteSettle
 * cover; chunk suspend uses null so a warm open does not flash empty thread
 * chrome. Soft Drop is different: the sheet starts empty until the panel
 * chunk lands — DropLayerPanelPending is the same cold jacket, module-pending
 * only (navigateDropPlace awaits warm first for the common tap path).
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
  {
    ssr: false,
    loading: () => <DropLayerPanelPending />,
  }
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
  /**
   * Direct replies already painted under this OP in the feed block. Seeded
   * into the sheet so the chain does not soft-fill after appear.
   */
  seedReplies?: PostRow[] | null;
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
    /** Feed-block replies already under the OP — first sheet paint includes them. */
    seedReplies?: PostRow[] | null;
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

function commitFirstPlaceLayer(canonical: string): void {
  if (typeof window === 'undefined') return;
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (currentUrl === canonical) {
    if (historyHasPlaceLayer()) {
      getPlaceHistoryGuard().depth = readPlaceLayerDepth();
    }
    return;
  }
  pushPlaceLayer(canonical);
}

function commitTrailPlaceLayer(
  prev: readonly { id: string }[],
  next: readonly PlaceLayerTarget[],
  canonical: string
): void {
  if (typeof window === 'undefined') return;
  const parent = next[0];
  applyPlaceTrailHistory({
    prevLength: prev.length,
    nextLength: next.length,
    parentChanged: parent != null && parent.id !== prev[0]?.id,
    parentHref: parent ? placeLayerHref(parent) : canonical,
    topHref: canonical,
  });
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
  rootEngagement?: PostEngagement | null,
  seedReplies?: PostRow[] | null
): GuildPostPageData {
  const replies = seedReplies?.length ? seedReplies : [];
  return {
    root,
    replies,
    quotes: [],
    replyTree: directRepliesToTree(replies),
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
  rootEngagement?: PostEngagement | null,
  seedReplies?: PostRow[] | null
): PersonalPostPageData {
  const replies = seedReplies?.length ? seedReplies : [];
  return {
    root,
    replies,
    quotes: [],
    replyTree: directRepliesToTree(replies),
    hasMoreReplies: false,
    engagement: rootEngagement ? { [postKey(root)]: rootEngagement } : {},
    scarceEmbeds: scarceEmbedsForOpenRoot(root),
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
        ? seedEmbeddedThread(
            layer.root,
            layer.rootEngagement,
            layer.seedReplies
          )
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
                          ? seedGuildThread(
                              layer.root,
                              layer.rootEngagement,
                              layer.seedReplies
                            )
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
        <div
          className="drop-sheet-fill"
          data-drop-layer-sheet=""
          onClickCapture={leaveFromDrop}
        >
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
            suspendDock={parked || !open}
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
    if (typeof window !== 'undefined') {
      getPlaceHistoryGuard().depth = 0;
    }
  }

  const mediaFaceCovered =
    stack.some((entry) => entry.id !== closingId) && isOsMediaFaceOpen();

  // Eager prefetch — first tap should hit a cached chunk; open still awaits.
  useEffect(() => {
    warmFeedOpenChunks();
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
      const guard = getPlaceHistoryGuard();
      const depth = guard.depth;
      guard.depth = 0;
      if (depth > 1) {
        schedulePlaceHistoryGo(-depth, () => {
          guard.depth = 0;
        });
        return;
      }
      if (historyHasPlaceLayer()) {
        nativeHistoryReplaceState(withoutPlaceLayerHistoryState(), underlay);
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
   * Reply / Mint dock for the live sheet. A normal post stays under the
   * constant dock band (51). Soft drop always publishes above its rendered
   * sheet — nested reply opens and face-lifted paints (~170) used to leave
   * Mint under the panel when dock stayed null / CSS fallback was late.
   * Re-sample the live face for drops — the open-time flag can miss a face
   * that is still mounted under the sheet.
   */
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    const top = stack[stack.length - 1];
    const live = top != null && top.id !== closingId && !onProfileHop;
    const aboveFace =
      Boolean(top?.openedAboveMediaFace) ||
      (top?.kind === 'drop' && isOsMediaFaceOpen());
    const rendered =
      live && top ? resolveGlassSheetZIndex(top.zIndex, aboveFace) : null;
    let dock = postLayerOverlayZ(rendered).dock;
    if (live && top?.kind === 'drop' && rendered != null) {
      dock = Math.max(dock ?? SHEET_Z.launcher, rendered + 1);
    }
    if (dock != null) {
      document.body.style.setProperty('--os-thread-dock-z', String(dock));
    } else {
      document.body.style.removeProperty('--os-thread-dock-z');
    }
    return () => {
      document.body.style.removeProperty('--os-thread-dock-z');
    };
  }, [closingId, onProfileHop, stack]);

  const closePostThread = useCallback(() => {
    const current = stackRef.current;
    // The film comes back with this step, including the last sheet.
    setMediaFacesYielded(false);
    const top = current[current.length - 1];
    const guard = typeof window === 'undefined' ? null : getPlaceHistoryGuard();
    // One history entry per screen. Back pops it; popstate walks one layer.
    if (current.length > 1 && top && isReaderLayerKind(top.kind)) {
      if (guard && guard.depth > 1 && historyHasPlaceLayer()) {
        window.history.back();
        return;
      }
      const walked = walkBackOneStep(current);
      if (walked) {
        const prev = walked[walked.length - 1];
        stackRef.current = walked;
        setStack(walked);
        if (prev && guard) replacePlaceLayer(placeLayerHref(prev));
      }
      return;
    }
    if (!beginCloseTop()) return;
    if (!guard) return;
    const underlay = underlayPathRef.current ?? '/home';
    const back = beginHistoryBack({
      depth: guard.depth,
      historyHasLayer: historyHasPlaceLayer(),
    });
    if (back.back) {
      closePopPendingRef.current = back.armPending;
      window.history.back();
      return;
    }
    nativeHistoryReplaceState(withoutPlaceLayerHistoryState(), underlay);
    guard.depth = 0;
  }, [beginCloseTop]);

  const publishClosingHistory = useCallback(
    (canonical: string, depth: number) => {
      if (typeof window === 'undefined') return;
      overlayCanonicalRef.current = canonical;
      const guard = getPlaceHistoryGuard();
      const nextDepth = Math.max(depth, 1);
      guard.depth = nextDepth;
      const action = repairClosingLayerHistory({
        canonical,
        currentUrl: `${window.location.pathname}${window.location.search}`,
        historyHasLayer: historyHasPlaceLayer(),
      });
      if (action.op === 'push') {
        nativeHistoryPushState(
          withPlaceLayerHistoryState(nextDepth),
          action.href
        );
      } else if (action.op === 'replace') {
        nativeHistoryReplaceState(
          withPlaceLayerHistoryState(nextDepth),
          action.href
        );
      }
    },
    []
  );

  const openPostThread = useCallback(
    ({
      href,
      root = null,
      context = null,
      rootEngagement = null,
      seedReplies = null,
      returnToPost = false,
    }: {
      href: string;
      root?: PostRow | null;
      context?: ThreadSheetContext | null;
      rootEngagement?: PostEngagement | null;
      seedReplies?: PostRow[] | null;
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
        const faces = seedReplies?.length ? [root, ...seedReplies] : [root];
        seedPostAuthorProfilesFromFeed(faces, { notify: true });
        seedGuildDisplayNamesFromFeed(faces, { notify: true });
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

      // Await the panel chunk so a cold hard-refresh tap never mounts a blank sheet.
      void ensurePostPanelChunk(parsed.groupId ? 'guild' : 'personal').then(
        () => {
          const personalPage = parseInAppPostLayerHref(pathname);
          const guildPage = personalPage
            ? null
            : parseGuildPostLayerHref(pathname);
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
            alignPlaceHistory(revealed.stack.length, canonical);
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
              seedReplies,
              zIndex: nextPostLayerZIndex(null, false),
              openedAboveMediaFace: false,
            };
            closingIdRef.current = null;
            setClosingId(null);
            stackRef.current = [only];
            setStack([only]);
            requestCloseMediaFaces();
            if (typeof window === 'undefined') return true;
            alignPlaceHistory(1, canonical);
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
              seedReplies,
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
              publishClosingHistory(canonical, trail.length);
              return true;
            }
            commitTrailPlaceLayer(liveStack, trail, canonical);
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
            seedReplies,
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
          if (droppedClosing) {
            publishClosingHistory(canonical, 1);
            return true;
          }
          commitFirstPlaceLayer(canonical);
          return true;
        }
      );
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
            replacePlaceLayer(canonical);
          }
        }
        return true;
      }

      void warmQuotesOpen().then(() => {
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
            publishClosingHistory(canonical, trail.length);
            return true;
          }
          commitTrailPlaceLayer(liveStack, trail, canonical);
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
          publishClosingHistory(canonical, 1);
          return true;
        }
        commitFirstPlaceLayer(canonical);
        return true;
      });
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
          publishClosingHistory(canonical, 1);
          return true;
        }
        alignPlaceHistory(1, canonical);
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
        publishClosingHistory(canonical, 1);
        return true;
      }
      commitFirstPlaceLayer(canonical);
      return true;
    },
    [pathname, publishClosingHistory]
  );

  // E2E: open a cold drop sheet without a list seed (was InstantHost).
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E_WALLET !== '1') return;
    type E2EWindow = Window & {
      __osOpenUncachedDrop?: (collectionId: string) => void;
    };
    const open = (collectionId: string) => {
      const id = collectionId.trim();
      if (!id) return;
      openDrop({ href: collectionPath(id) });
    };
    (window as E2EWindow).__osOpenUncachedDrop = open;
    return () => {
      const e2e = window as E2EWindow;
      if (e2e.__osOpenUncachedDrop === open) delete e2e.__osOpenUncachedDrop;
    };
  }, [openDrop]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const guard = getPlaceHistoryGuard();
    guard.closeTop = () => {
      closePostThread();
    };
    guard.onPop = () => {
      const pendingClosePop = closePopPendingRef.current;
      closePopPendingRef.current = false;
      // Back already started closing a layer, then a new one replaced it
      // before this pop landed. That pop belongs to the layer we dropped.
      const repair = inFlightPopRepair({
        pendingClosePop,
        closingId: closingIdRef.current,
        stackLength: stackRef.current.length,
        historyHasLayer: historyHasPlaceLayer(),
        canonical: overlayCanonicalRef.current,
      });
      if (repair.swallow) {
        if (repair.pushHref) {
          const depth = Math.max(stackRef.current.length, 1);
          nativeHistoryPushState(
            withPlaceLayerHistoryState(depth),
            repair.pushHref
          );
          guard.depth = depth;
        } else {
          guard.depth = readPlaceLayerDepth();
        }
        return;
      }
      const top = stackRef.current[stackRef.current.length - 1];
      guard.depth = readPlaceLayerDepth();
      if (!top) return;
      // One Back, one screen. The parked parent stays.
      if (stackRef.current.length > 1 && isReaderLayerKind(top.kind)) {
        const walked = walkBackOneStep(stackRef.current);
        if (walked) {
          stackRef.current = walked;
          setStack(walked);
          return;
        }
      }
      beginCloseTop();
    };
  }, [beginCloseTop, closePostThread]);

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
  }, []);

  const openProfileFromLayer = useCallback(
    (href: string) => {
      const path = href.split(/[?#]/)[0] ?? href;
      const underlay = underlayPathRef.current;
      ensurePostThreadParkedStyle();
      setProfileHop(path);
      // Keep the post mounted. Drop only its history flag so the portfolio
      // sits on the feed entry; Back lands here and the post is shown again.
      const guard = getPlaceHistoryGuard();
      const depth = guard.depth;
      guard.depth = 0;
      if (typeof window !== 'undefined' && depth > 1) {
        schedulePlaceHistoryGo(-depth, () => {
          if (path !== pathname) router.push(href);
        });
        return;
      }
      if (typeof window !== 'undefined' && historyHasPlaceLayer()) {
        nativeHistoryReplaceState(
          withoutPlaceLayerHistoryState(),
          underlay ?? path
        );
      }
      if (path !== pathname) router.push(href);
    },
    [pathname, router]
  );

  useLayoutEffect(() => {
    if (profileHop || stack.length === 0 || pathname !== underlayPath) return;
    if (typeof window === 'undefined' || historyHasPlaceLayer()) return;
    const guard = getPlaceHistoryGuard();
    let depth = 0;
    for (const entry of stack) {
      depth += 1;
      nativeHistoryPushState(
        withPlaceLayerHistoryState(depth),
        placeLayerHref(entry)
      );
    }
    guard.depth = depth;
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
  useLayoutEffect(() => {
    setOsDropSheetOpen(dropDockLive);
    return () => setOsDropSheetOpen(false);
  }, [dropDockLive]);
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
  const readerDockLive =
    topPlace != null && topPlace.kind !== 'drop' && topOpen && !onProfileHop;
  useClaimPlaceLayerDockBack(
    readerDockLive,
    readerDockLive
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
