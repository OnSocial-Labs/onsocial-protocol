'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  postContentPath,
  type Paginated,
  type PostRow,
  type PostScarceEmbed,
} from '@onsocial/sdk';
import {
  OnSocialMark,
  OsAppChromePage,
  OsAppChromeToolbarRail,
  PulsingDots,
} from '@onsocial/ui';
import type { PostEngagement } from '@/hooks/use-post-engagement';
import { OsChromeListAlert } from '@/components/chrome/os-chrome-whisper';
import { ListLoadError } from '@/components/panels/list-load-error';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { OsPageBodyAppear } from '@/components/app/os-page-body-appear';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { HomeFeedChipBar } from '@/features/home/home-feed-chip-bar';
import { HomeFeedHotUpdatedChip } from '@/features/home/home-feed-hot-updated-chip';
import { HomeFeedNewPostsChip } from '@/features/home/home-feed-new-posts-chip';
import { HomeFeedPullIndicator } from '@/features/home/home-feed-pull-indicator';
import { useHomeFeedPullRefresh } from '@/features/home/use-home-feed-pull-refresh';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';
import { HomeFeedSortToggle } from '@/features/home/home-feed-sort-toggle';
import { APP_DISCOVER_PATH, APP_HOME_PATH } from '@/lib/app-routes';
import {
  captureVisibleFeedAnchor,
  feedListMutationNeedsScrollAnchor,
  restoreFeedAnchor,
  type FeedScrollAnchor,
} from '@/features/home/home-feed-scroll-anchor';
import {
  canRunHomeFeedReconcile,
  canStartHomeFeedAppend,
} from '@/features/home/home-feed-load-gate';
import { FeedWindowSizeCache } from '@/features/home/feed-window';
import type { FeedWindowRangeChange } from '@/features/home/use-feed-window';
import {
  homeFeedHasMore,
  isHomeFeedSocialLens,
  type HomeFeedPageCursor,
} from '@/features/home/home-feed-pulse';
import {
  countVisibleHomeFeedCards,
  homeFeedIncludeForeignReplies,
  homeFeedShowsTimelineChrome,
} from '@/features/home/home-feed-visible';
import {
  fetchHomeFeedPageClient,
  loadFeedPaint,
  loadFocusedFeedPage,
  mergeFeedPosts,
} from '@/features/home/home-feed-page-client';
import {
  shouldAdoptSpeculativeFeedPage,
  shouldRequestSpeculativeFeedPage,
  speculativeFeedKeepsPaint,
} from '@/features/home/home-feed-speculative';
import {
  homeFeedLensEmptyCopy,
  readStoredHomeFeedLens,
  resolveHomeFeedLens,
  writeStoredHomeFeedLens,
  type HomeFeedLens,
} from '@/features/home/home-feed-lens';
import {
  readHomeFeedSort,
  writeHomeFeedSort,
  type HomeFeedSort,
} from '@/features/home/home-feed-sort';
import { HomeActiveFocusProvider } from '@/features/home/home-active-hashtag';
import {
  homeFeedFocusClearPath,
  homeFeedFocusEmptyCopy,
  homeFeedFocusKey,
  homeFeedFocusPath,
  HOME_HASHTAG_QUERY_KEY,
  HOME_PLACE_QUERY_KEY,
  HOME_TICKER_QUERY_KEY,
  parseHomeFeedFocus,
  type HomeFeedFocus,
} from '@/features/home/home-feed-focus';
import { HomeSavedFeedSheet } from '@/features/home/home-saved-feed-sheet';
import {
  addHomeSavedFeed,
  homeSavedFeedFocus,
  readHomeSavedFeeds,
  removeHomeSavedFeed,
  type HomeSavedFeed,
} from '@/features/home/home-saved-feeds';
import {
  PersonalFeedList,
  insertOptimisticFeedPost,
  shouldPrependOptimisticFeedPost,
} from '@/features/home/personal-feed-list';
import {
  coldLoadReveal,
  HomeFeedReveal,
  nextColdLoadLoading,
  slowRefreshReveal,
} from '@/features/home/home-feed-reveal';
import {
  HOME_FEED_COLD_SKELETON_FRAMES,
  PostRowSkeleton,
  postKey,
} from '@/features/home/post-card';
import { usePersonalComposer } from '@/features/home/use-personal-composer';
import {
  subscribePersonalPostConfirmed,
  subscribePersonalReplyConfirmed,
} from '@/features/scarces/drop-compose-host';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import { useListScrollRestore } from '@/hooks/use-list-scroll-restore';
import { sortPostsByHot } from '@/lib/amplify-heat';
import {
  fillEngagementSeedFromFeedRows,
  loadPostEngagementMap,
} from '@/lib/feed-paint-hydrate';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import type { FeedQuoteSeed } from '@/lib/prepare-feed-paint';
import type { PollTally } from '@/lib/poll-votes';
import type { ProtocolDaoMemberships } from '@/lib/protocol-dao-memberships';
import {
  EMPTY_UNSEEN_FEED_SUMMARY,
  feedPostKeySet,
  HOME_FEED_HOT_UPDATED_SCROLL_PX,
  HOME_FEED_NEW_AVATAR_SLOTS,
  HOME_FEED_NEW_POLL_MS,
  HOME_FEED_NEW_PROBE_SIZE,
  homeFeedNewPostsCountLabel,
  hotFeedHeadOrderChanged,
  hotFeedRisingAuthorIds,
  mergeHomeFeedHead,
  mergeHotFeedHead,
  summarizeUnseenFeedPosts,
  unseenFeedSummariesEqual,
  type UnseenFeedSummary,
} from '@/lib/home-feed-new-posts';
import {
  getLastAmplifyAuthorId,
  getViewerAmplifyEpoch,
  subscribeViewerAmplifyConfirmed,
} from '@/lib/home-feed-amplify-epoch';
import {
  HOME_FEED_SSR_SESSION_KEY,
  clampHomeFeedCursorAfterTrim,
  homeFeedSessionKey,
  homeFeedSessionProbeDelayMs,
  shouldKeepRestoredHomeFeed,
  noteHomeFeedSessionScroll,
  peekHomeFeedSession,
  quotedForPosts,
  recordForPosts,
  writeHomeFeedSession,
} from '@/lib/home-feed-session';
import {
  assignStableFeedBlockKeys,
  coalesceFeedThreads,
  type FeedBlockKeyState,
} from '@/lib/feed-threads';
import {
  FEED_CATCH_UP_SCROLLING_CLASS,
  scrollFeedToNewest,
} from '@/lib/feed-scroll-to-newest';
import { warmPostPanels } from '@/lib/thread-first-page';
import {
  reconcileFeedRows,
  selectFeedReconcileTargets,
} from '@/lib/home-feed-reconcile';
import {
  getViewerStandEpoch,
  subscribeViewerStandConfirmed,
} from '@/lib/viewer-standing-global';
import {
  createListScrollMemory,
  scrollLineOnLeave,
  scrollTopToPersist,
} from '@/lib/list-scroll-restore';
import { getAppLenis } from '@/lib/app-lenis-registry';
import {
  HOME_FEED_MEMORY_TRIM_IDLE_MS,
  HOME_FEED_WORKING_SET_POSTS,
  homeFeedMemoryTrimNeedsScrollAnchor,
  planHomeFeedMemoryTrim,
  trimHomeFeedWorkingSetKeepingHead,
} from '@/lib/home-feed-working-set';
import { revokeDroppedOptimisticMedia } from '@/lib/post-media';
import { filterHiddenAuthors } from '@/lib/viewer-mute-block-filter';
import {
  isCurrentLoadingRequest,
  resolveAppLoadingPresentation,
} from '@/lib/app-loading-contract';
import {
  getGlobalViewerBlockLedgerVersion,
  subscribeGlobalViewerBlockLedger,
} from '@/lib/viewer-block-global';
import {
  getGlobalViewerMuteLedgerVersion,
  subscribeGlobalViewerMuteLedger,
} from '@/lib/viewer-mute-global';

function HomeFeedLoadMoreFooter({
  loadMoreSentinelRef,
  showSentinel,
  showAppendPending,
}: {
  loadMoreSentinelRef: RefObject<HTMLDivElement | null>;
  showSentinel: boolean;
  showAppendPending: boolean;
}) {
  if (!showSentinel && !showAppendPending) return null;

  return (
    <div className="home-feed-load-more">
      {showSentinel ? (
        <div
          ref={loadMoreSentinelRef}
          className="home-feed-sentinel"
          aria-hidden
        />
      ) : null}
      {showAppendPending ? (
        <div className="list-append-pending">
          <PulsingDots size="sm" label="Loading more" />
        </div>
      ) : null}
    </div>
  );
}

export function HomePagePanel({
  initialPage = null,
  initialEngagement = null,
  initialScarceEmbeds = null,
  initialQuoted = null,
  initialTallies = null,
  initialMemberships = null,
}: {
  initialPage?: Paginated<PostRow> | null;
  initialEngagement?: Record<string, PostEngagement> | null;
  initialScarceEmbeds?: Record<string, PostScarceEmbed> | null;
  initialQuoted?: FeedQuoteSeed | null;
  initialTallies?: Record<string, PollTally> | null;
  initialMemberships?: Record<string, ProtocolDaoMemberships> | null;
} = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accountId, isConnected, isLoading: walletLoading } = useAppWallet();
  // Memory only — a storage read here would render the list where SSR
  // rendered the shell, a hydration mismatch. Storage joins post-hydration.
  const restoredSessionRef = useRef(
    peekHomeFeedSession(undefined, { hydrateStorage: false })
  );
  const restoredSession = restoredSessionRef.current;
  const sessionRestoreReloadNonceRef = useRef(0);
  const scrollMemoryRef = useRef(
    createListScrollMemory(restoredSession?.scrollTop ?? 0)
  );
  // Row heights measured by the feed window — persisted with the session so
  // a restore lands on the same content, not on estimate placeholders.
  const feedWindowCacheRef = useRef<FeedWindowSizeCache | null>(null);
  if (feedWindowCacheRef.current == null) {
    const cache = new FeedWindowSizeCache();
    cache.prime(restoredSession?.blockHeights);
    feedWindowCacheRef.current = cache;
  }
  /** Mirrored from PersonalFeedList — size-cache retain uses the same keys. */
  const feedBlockKeyStateRef = useRef<FeedBlockKeyState[]>([]);
  /** Mounted block band from the feed window — drives idle memory trim. */
  const feedWindowRangeRef = useRef<FeedWindowRangeChange>({
    start: 0,
    end: 0,
    blockCount: 0,
  });
  const memoryTrimTimerRef = useRef<number | null>(null);
  const scheduleMemoryTrimRef = useRef<() => void>(() => {});
  const isLoadingMoreRef = useRef(false);
  const reRankAnchorRef = useRef<FeedScrollAnchor | null>(null);
  const reRankAnchorMissRef = useRef(0);
  const includeForeignRepliesRef = useRef(false);
  const stoodWithAccountIdsRef = useRef<Set<string> | undefined>(undefined);
  const serverPainted = initialPage != null;
  const [quotedSeed, setQuotedSeed] = useState<FeedQuoteSeed>(
    () => restoredSession?.quoted ?? initialQuoted ?? {}
  );
  const [pollSeed, setPollSeed] = useState<Record<string, PollTally>>(
    () => restoredSession?.tallies ?? initialTallies ?? {}
  );
  const [daoSeed, setDaoSeed] = useState<
    Record<string, ProtocolDaoMemberships>
  >(() => restoredSession?.memberships ?? initialMemberships ?? {});
  const [engagementSeed, setEngagementSeed] = useState(
    () => restoredSession?.engagement ?? initialEngagement
  );
  const quotedSeedRef = useRef(quotedSeed);
  const pollSeedRef = useRef(pollSeed);
  const daoSeedRef = useRef(daoSeed);
  const engagementSeedRef = useRef(engagementSeed);
  quotedSeedRef.current = quotedSeed;
  pollSeedRef.current = pollSeed;
  daoSeedRef.current = daoSeed;
  engagementSeedRef.current = engagementSeed;
  const sidePaintSavedRef = useRef(
    serverPainted ||
      (restoredSession?.quoted != null &&
        restoredSession.memberships != null &&
        restoredSession.tallies != null)
  );
  const clientRevealFlight = useRef(0);
  const [posts, setPosts] = useState<PostRow[]>(
    () => restoredSession?.posts ?? initialPage?.items ?? []
  );
  const [standingNetworkIds, setStandingNetworkIds] = useState<
    readonly string[] | null
  >(() => restoredSession?.standingNetworkIds ?? null);
  const [muteBlockSyncVersion, setMuteBlockSyncVersion] = useState(
    () =>
      getGlobalViewerMuteLedgerVersion() + getGlobalViewerBlockLedgerVersion()
  );
  useEffect(() => {
    const bump = () => {
      setMuteBlockSyncVersion(
        getGlobalViewerMuteLedgerVersion() + getGlobalViewerBlockLedgerVersion()
      );
    };
    const unsubMute = subscribeGlobalViewerMuteLedger(bump);
    const unsubBlock = subscribeGlobalViewerBlockLedger(bump);
    return () => {
      unsubMute();
      unsubBlock();
    };
  }, []);
  const visiblePosts = useMemo(
    () => filterHiddenAuthors(posts),
    // mute/block ledger version forces re-filter after mute/block confirms
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [posts, muteBlockSyncVersion]
  );
  const [nextOffset, setNextOffset] = useState<number | undefined>(undefined);
  const [nextBeforeBlockHeight, setNextBeforeBlockHeight] = useState<
    number | undefined
  >(
    () =>
      restoredSession?.nextBeforeBlockHeight ??
      initialPage?.nextBeforeBlockHeight
  );
  const [nextBeforeHeat, setNextBeforeHeat] = useState<number | undefined>(
    () => restoredSession?.nextBeforeHeat ?? initialPage?.nextBeforeHeat
  );
  const [nextBeforeEventKey, setNextBeforeEventKey] = useState<
    string | undefined
  >(
    () =>
      restoredSession?.nextBeforeEventKey ?? initialPage?.nextBeforeEventKey
  );
  const [isLoading, setIsLoading] = useState(
    () => restoredSession == null && initialPage == null
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [engagementError, setEngagementError] = useState<string | null>(null);
  const [hiddenWalkGaveUp, setHiddenWalkGaveUp] = useState(false);
  const hiddenWalksRef = useRef(0);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [hotUpdated, setHotUpdated] = useState(false);
  const [hotUpdatedAuthors, setHotUpdatedAuthors] = useState<string[]>([]);
  const [unseenPosts, setUnseenPosts] = useState<UnseenFeedSummary>(
    EMPTY_UNSEEN_FEED_SUMMARY
  );
  const [lens, setLens] = useState<HomeFeedLens>('global');
  const [lensReady, setLensReady] = useState(false);
  const [sort, setSort] = useState<HomeFeedSort>('hot');
  const [ssrBootstrapDone, setSsrBootstrapDone] = useState(
    () => restoredSession != null || initialPage != null
  );
  const sortInitializedRef = useRef(false);
  const sortUserChangedRef = useRef(false);
  const [savedFeeds, setSavedFeeds] = useState<HomeSavedFeed[]>([]);
  const [savedFeedSheetOpen, setSavedFeedSheetOpen] = useState(false);
  const tagParam = searchParams.get(HOME_HASHTAG_QUERY_KEY);
  const tickerParam = searchParams.get(HOME_TICKER_QUERY_KEY);
  const placeParam = searchParams.get(HOME_PLACE_QUERY_KEY);
  const activeFocus = useMemo(
    () =>
      parseHomeFeedFocus({
        tag: tagParam,
        ticker: tickerParam,
        place: placeParam,
      }),
    [tagParam, tickerParam, placeParam]
  );
  const activeFocusKey = homeFeedFocusKey(activeFocus);
  const savedFocusKeys = useMemo(
    () =>
      new Set(
        savedFeeds.map((feed) => homeFeedFocusKey(homeSavedFeedFocus(feed)))
      ),
    [savedFeeds]
  );

  const scrollRootRef = useRef<HTMLElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const loadIdRef = useRef(0);
  const appendInFlightRef = useRef(false);
  // State, not a ref: the windowed list pins this row's render for the pass
  // between the re-rank merge and the pre-paint anchor restore.
  const [reRankAnchor, setReRankAnchor] = useState<FeedScrollAnchor | null>(
    () => {
      const key = restoredSession?.scrollAnchorKey?.trim();
      if (!key) return null;
      const top = restoredSession?.scrollAnchorTop;
      const anchor = {
        key,
        top: typeof top === 'number' && Number.isFinite(top) ? top : 0,
      };
      reRankAnchorRef.current = anchor;
      return anchor;
    }
  );

  /** Capture before setPosts; sync the ref so trim / pin see it this frame. */
  const holdFeedScrollAnchor = useCallback(() => {
    const anchor = captureVisibleFeedAnchor(scrollRootRef.current);
    reRankAnchorRef.current = anchor;
    setReRankAnchor(anchor);
    return anchor;
  }, []);
  const standingSourcesRef = useRef<string[] | null>(
    restoredSession?.standingNetworkIds
      ? [...restoredSession.standingNetworkIds]
      : null
  );
  const nextOffsetRef = useRef<number | undefined>(undefined);
  const nextBeforeBlockHeightRef = useRef<number | undefined>(
    restoredSession?.nextBeforeBlockHeight ??
      initialPage?.nextBeforeBlockHeight
  );
  const nextBeforeHeatRef = useRef<number | undefined>(
    restoredSession?.nextBeforeHeat ?? initialPage?.nextBeforeHeat
  );
  const nextBeforeEventKeyRef = useRef<string | undefined>(
    restoredSession?.nextBeforeEventKey ?? initialPage?.nextBeforeEventKey
  );

  const applyFeedPageCursor = useCallback((page: Paginated<PostRow>) => {
    // Feed pages never mint nextOffset — clear any restored legacy value.
    setNextOffset(undefined);
    nextOffsetRef.current = undefined;
    setNextBeforeBlockHeight(page.nextBeforeBlockHeight);
    nextBeforeBlockHeightRef.current = page.nextBeforeBlockHeight;
    setNextBeforeHeat(page.nextBeforeHeat);
    nextBeforeHeatRef.current = page.nextBeforeHeat;
    setNextBeforeEventKey(page.nextBeforeEventKey);
    nextBeforeEventKeyRef.current = page.nextBeforeEventKey;
  }, []);

  const clearFeedPageCursor = useCallback(() => {
    setNextOffset(undefined);
    nextOffsetRef.current = undefined;
    setNextBeforeBlockHeight(undefined);
    nextBeforeBlockHeightRef.current = undefined;
    setNextBeforeHeat(undefined);
    nextBeforeHeatRef.current = undefined;
    setNextBeforeEventKey(undefined);
    nextBeforeEventKeyRef.current = undefined;
  }, []);
  const postsLengthRef = useRef(
    restoredSession?.posts.length ?? initialPage?.items.length ?? 0
  );
  const postsRef = useRef<PostRow[]>(
    restoredSession?.posts ?? initialPage?.items ?? []
  );
  const seenPostKeysRef = useRef<Set<string>>(
    feedPostKeySet(restoredSession?.posts ?? initialPage?.items ?? [])
  );
  const newPostsProbeInFlightRef = useRef(false);
  const unseenPostsRef = useRef<UnseenFeedSummary>(EMPTY_UNSEEN_FEED_SUMMARY);
  /** Legacy session field — always 0 after keyset-only cutover. */
  const offsetShiftAppliedRef = useRef(0);
  const isRefreshingRef = useRef(false);
  const isLoadingRef = useRef(restoredSession == null && initialPage == null);
  const ssrBootstrapDoneRef = useRef(
    restoredSession != null || initialPage != null
  );
  /** Skip duplicate global/hot fetch after SSR seed; cleared on lens/sort/focus. */
  const ssrHotGlobalSkipRef = useRef(
    restoredSession == null && initialPage != null
  );
  const ssrHotGlobalReloadNonceRef = useRef(0);
  const feedSessionKeyRef = useRef<string | null>(
    restoredSession?.sessionKey ??
      (initialPage != null ? HOME_FEED_SSR_SESSION_KEY : null)
  );

  const persistFeedSession = useCallback((options?: { storage?: boolean }) => {
    const node = scrollRootRef.current;
    const memory = scrollMemoryRef.current;
    const live = node?.scrollTop ?? 0;
    const lenisTop = node ? (getAppLenis(node)?.scroll ?? 0) : 0;
    const line = memory.userAdjusted
      ? memory.landed
      : scrollLineOnLeave(Math.max(live, lenisTop), memory.landed);
    const scrollAnchor =
      reRankAnchorRef.current ?? captureVisibleFeedAnchor(node);
    writeHomeFeedSession({
      sessionKey: feedSessionKeyRef.current,
      posts: postsRef.current,
      nextOffset: nextOffsetRef.current,
      nextBeforeBlockHeight: nextBeforeBlockHeightRef.current,
      nextBeforeHeat: nextBeforeHeatRef.current,
      nextBeforeEventKey: nextBeforeEventKeyRef.current,
      standingNetworkIds: standingSourcesRef.current,
      offsetShiftApplied: offsetShiftAppliedRef.current,
      scrollTop: scrollTopToPersist(memory, line),
      scrollAnchorKey: scrollAnchor?.key ?? null,
      scrollAnchorTop: scrollAnchor?.top,
      standEpoch: getViewerStandEpoch(),
      amplifyEpoch: getViewerAmplifyEpoch(),
      blockHeights: feedWindowCacheRef.current?.toJSON(),
      quoted: sidePaintSavedRef.current ? quotedSeedRef.current : undefined,
      tallies: sidePaintSavedRef.current ? pollSeedRef.current : undefined,
      memberships: sidePaintSavedRef.current ? daoSeedRef.current : undefined,
      engagement: sidePaintSavedRef.current
        ? (engagementSeedRef.current ?? undefined)
        : undefined,
      storage: options?.storage !== false,
    });
  }, []);

  const persistFeedSessionToStorage = useCallback(() => {
    persistFeedSession();
  }, [persistFeedSession]);

  useEffect(
    () => () => persistFeedSessionToStorage(),
    [persistFeedSessionToStorage]
  );

  // A refresh or closed tab never runs the unmount cleanup — pagehide does.
  useEffect(() => {
    window.addEventListener('pagehide', persistFeedSessionToStorage);
    return () =>
      window.removeEventListener('pagehide', persistFeedSessionToStorage);
  }, [persistFeedSessionToStorage]);

  /**
   * Hard refresh — hydrate the tab-storage snapshot after the first render
   * (SSR and hydration both show the shell), then swap the list in before
   * paint. The main load effect sees the ref and skips a duplicate fetch.
   */
  useLayoutEffect(() => {
    if (restoredSessionRef.current) return;
    const snap = peekHomeFeedSession();
    if (!snap) return;
    restoredSessionRef.current = snap;
    feedWindowCacheRef.current?.prime(snap.blockHeights);
    postsRef.current = snap.posts;
    postsLengthRef.current = snap.posts.length;
    seenPostKeysRef.current = feedPostKeySet(snap.posts);
    standingSourcesRef.current = snap.standingNetworkIds
      ? [...snap.standingNetworkIds]
      : null;
    nextOffsetRef.current = snap.nextOffset;
    nextBeforeBlockHeightRef.current = snap.nextBeforeBlockHeight;
    nextBeforeHeatRef.current = snap.nextBeforeHeat;
    nextBeforeEventKeyRef.current = snap.nextBeforeEventKey;
    offsetShiftAppliedRef.current = snap.offsetShiftApplied;
    feedSessionKeyRef.current = snap.sessionKey;
    scrollMemoryRef.current = createListScrollMemory(snap.scrollTop);
    ssrBootstrapDoneRef.current = true;
    isLoadingRef.current = false;
    if (
      snap.quoted != null &&
      snap.memberships != null &&
      snap.tallies != null
    ) {
      sidePaintSavedRef.current = true;
      quotedSeedRef.current = snap.quoted;
      pollSeedRef.current = snap.tallies;
      daoSeedRef.current = snap.memberships;
      if (snap.engagement) engagementSeedRef.current = snap.engagement;
      setQuotedSeed(snap.quoted);
      setPollSeed(snap.tallies);
      setDaoSeed(snap.memberships);
      if (snap.engagement) setEngagementSeed(snap.engagement);
    }
    setPosts(snap.posts);
    setStandingNetworkIds(
      snap.standingNetworkIds ? [...snap.standingNetworkIds] : null
    );
    setNextOffset(snap.nextOffset);
    setNextBeforeBlockHeight(snap.nextBeforeBlockHeight);
    setNextBeforeHeat(snap.nextBeforeHeat);
    setNextBeforeEventKey(snap.nextBeforeEventKey);
    setSsrBootstrapDone(true);
    setIsLoading(false);
  }, []);

  // After the storage read above. Memory only, so a cold seed cannot
  // overwrite a saved tab list. Leaving remounts from this copy.
  useLayoutEffect(() => {
    persistFeedSession({ storage: false });
  });

  // Append re-rank captured an anchor just before setPosts; put the row
  // back at its viewport offset before paint so the merge is invisible.
  // Keep for a few frames if the pin has not mounted yet; clear when the
  // key left the working set so idle trim is not stuck forever.
  useLayoutEffect(() => {
    if (!reRankAnchor) {
      reRankAnchorMissRef.current = 0;
      return;
    }
    if (restoreFeedAnchor(scrollRootRef.current, reRankAnchor)) {
      reRankAnchorMissRef.current = 0;
      setReRankAnchor(null);
      return;
    }
    const keyStillPresent = feedBlockKeyStateRef.current.some(
      (entry) => entry.key === reRankAnchor.key
    );
    reRankAnchorMissRef.current += 1;
    if (!keyStillPresent || reRankAnchorMissRef.current > 3) {
      reRankAnchorMissRef.current = 0;
      setReRankAnchor(null);
    }
  }, [posts, reRankAnchor]);

  useEffect(() => {
    reRankAnchorRef.current = reRankAnchor;
  }, [reRankAnchor]);

  // Drop quote/poll/dao/engagement keys for rows no longer in the model
  // (refresh replace, jump-to-newest tail trim). Load-more only adds keys.
  // Fill engagement gaps from row public counts so speculative / SSR rows
  // never sit in `countsReady=false` while a later batch lands.
  useEffect(() => {
    setQuotedSeed((current) => quotedForPosts(posts, current));
    setPollSeed((current) => recordForPosts(posts, current, postKey) ?? {});
    setDaoSeed(
      (current) =>
        recordForPosts(posts, current, (post) =>
          post.accountId.trim().toLowerCase()
        ) ?? {}
    );
    setEngagementSeed((current) => {
      const trimmed = current
        ? (recordForPosts(posts, current, postKey) ?? {})
        : {};
      return fillEngagementSeedFromFeedRows(trimmed, posts);
    });
  }, [posts]);

  /**
   * Cold first visit — ask for the public hot page before the wallet and
   * lens resolve. The main load adopts it like the SSR hot seed, or
   * soft-refreshes into the stored lens/sort while these rows stay up.
   */
  const [speculativePage, setSpeculativePage] =
    useState<Paginated<PostRow> | null>(null);
  const speculativeRequestedRef = useRef(false);
  useEffect(() => {
    if (speculativeRequestedRef.current) return;
    const focus = parseHomeFeedFocus({
      tag: tagParam,
      ticker: tickerParam,
      place: placeParam,
    });
    if (
      !shouldRequestSpeculativeFeedPage({
        restoredSession: restoredSessionRef.current,
        initialPage,
        hasFocus: focus != null,
      })
    ) {
      return;
    }
    speculativeRequestedRef.current = true;
    let cancelled = false;
    void fetchHomeFeedPageClient('global', null, { offset: 0 }, null, 'hot')
      .then((result) => {
        if (!cancelled) setSpeculativePage(result.page);
      })
      .catch(() => {
        // The gated load that follows owns the error surface.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Warm personal + guild + quotes chunks as soon as the feed has rows so a
   * cold first tap paints the seeded OP instead of waiting on the download.
   */
  const threadWarmRef = useRef(false);
  useEffect(() => {
    if (threadWarmRef.current || posts.length === 0) return;
    threadWarmRef.current = true;
    warmPostPanels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts.length > 0]);

  useListScrollRestore(scrollRootRef, scrollMemoryRef, visiblePosts.length);

  useEffect(() => {
    nextOffsetRef.current = nextOffset;
  }, [nextOffset]);

  useEffect(() => {
    nextBeforeBlockHeightRef.current = nextBeforeBlockHeight;
  }, [nextBeforeBlockHeight]);

  useEffect(() => {
    nextBeforeHeatRef.current = nextBeforeHeat;
  }, [nextBeforeHeat]);

  useEffect(() => {
    nextBeforeEventKeyRef.current = nextBeforeEventKey;
  }, [nextBeforeEventKey]);

  useEffect(() => {
    postsLengthRef.current = posts.length;
    postsRef.current = posts;
    seenPostKeysRef.current = feedPostKeySet(posts);
  }, [posts]);

  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  useEffect(() => {
    isLoadingMoreRef.current = isLoadingMore;
  }, [isLoadingMore]);

  useEffect(() => {
    unseenPostsRef.current = unseenPosts;
  }, [unseenPosts]);

  const clearHotUpdated = useCallback(() => {
    setHotUpdated(false);
    setHotUpdatedAuthors([]);
  }, []);

  const armHotUpdated = useCallback((authorIds: readonly string[] = []) => {
    setHotUpdated(true);
    const fromArg = authorIds.map((id) => id.trim()).filter(Boolean);
    const last = getLastAmplifyAuthorId();
    const seeded = fromArg.length > 0 ? fromArg : last ? [last] : [];
    if (seeded.length === 0) return;
    setHotUpdatedAuthors((current) => {
      const next: string[] = [];
      for (const id of [...seeded, ...current]) {
        if (!id || next.includes(id)) continue;
        next.push(id);
        if (next.length >= HOME_FEED_NEW_AVATAR_SLOTS) break;
      }
      return next;
    });
  }, []);

  const clearUnseenPosts = useCallback(() => {
    setUnseenPosts(EMPTY_UNSEEN_FEED_SUMMARY);
    // Do not clear hotUpdated — amplify soft-refresh calls this at load start.
  }, []);

  const feedScrollTop = useCallback(() => {
    const root = scrollRootRef.current;
    if (!root) return 0;
    const lenisTop = getAppLenis(root)?.scroll ?? 0;
    return Math.max(root.scrollTop, lenisTop);
  }, []);

  /** Head inserts do not move a keyset edge — no offset compensation. */
  const growFeedWindow = useCallback((_insertedCount: number) => {}, []);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    ssrBootstrapDoneRef.current = ssrBootstrapDone;
  }, [ssrBootstrapDone]);

  useEffect(() => {
    if (walletLoading) return;
    setLens(readStoredHomeFeedLens(isConnected));
    const storedSort = readHomeFeedSort();
    if (!sortInitializedRef.current) {
      sortInitializedRef.current = true;
      if (!sortUserChangedRef.current) {
        setSort(storedSort);
      }
    }
    // SSR seed is always hot — if the user prefers Recent, soft-refetch
    // without treating the hot seed as a finished bootstrap for that sort.
    if (
      storedSort !== 'hot' &&
      initialPage != null &&
      ssrBootstrapDoneRef.current
    ) {
      setSsrBootstrapDone(false);
      ssrBootstrapDoneRef.current = false;
    }
    setLensReady(true);
  }, [isConnected, walletLoading, initialPage]);

  useEffect(() => {
    setSavedFeeds(readHomeSavedFeeds());
  }, []);

  const activeLens = resolveHomeFeedLens(lens, isConnected);

  const stoodWithAccountIds = useMemo(() => {
    if (activeFocus || !standingNetworkIds?.length) return undefined;
    // Keep Pulse peeks painted through a refresh, including a lens change
    // that has not swapped the rows yet.
    if (!isHomeFeedSocialLens(activeLens) && !isRefreshing) return undefined;
    return new Set(standingNetworkIds);
  }, [activeFocus, activeLens, isRefreshing, standingNetworkIds]);

  const includeForeignReplies = homeFeedIncludeForeignReplies(
    activeLens,
    activeFocus != null
  );
  includeForeignRepliesRef.current = includeForeignReplies;
  stoodWithAccountIdsRef.current = stoodWithAccountIds;
  const visibleCardCount = useMemo(
    () =>
      countVisibleHomeFeedCards(visiblePosts, {
        includeForeignReplies,
        stoodWithAccountIds,
      }),
    [includeForeignReplies, stoodWithAccountIds, visiblePosts]
  );

  const handleSortChange = useCallback(
    (next: HomeFeedSort) => {
      sortUserChangedRef.current = true;
      setSort(next);
      writeHomeFeedSort(next);
      if (next !== 'hot') clearHotUpdated();
    },
    [clearHotUpdated]
  );

  useEffect(() => {
    const fillSidePaint = (items: PostRow[]) => {
      if (items.length === 0 || clientRevealFlight.current !== 0) return;
      const flight = 1;
      clientRevealFlight.current = flight;
      void loadFeedPaint(items).then(
        (paint) => {
          if (clientRevealFlight.current !== flight) return;
          sidePaintSavedRef.current = true;
          setQuotedSeed((current) => ({ ...current, ...paint.quoted }));
          setPollSeed((current) => ({ ...current, ...paint.tallies }));
          setDaoSeed((current) => ({ ...current, ...paint.memberships }));
        },
        () => {
          // Quotes, tallies, and marks fill when they can. The list stays.
        }
      );
    };
    const releaseColdLoad = (items: PostRow[]) => {
      const decision = coldLoadReveal({
        serverPainted,
        settleStarted: clientRevealFlight.current !== 0,
      });
      isRefreshingRef.current = false;
      setIsRefreshing(false);
      const loadingNow = nextColdLoadLoading(isLoadingRef.current, decision);
      if (loadingNow !== isLoadingRef.current) {
        isLoadingRef.current = loadingNow;
        setIsLoading(loadingNow);
      }
      // The server paint and a saved snapshot already have quotes, tallies,
      // and marks. A second read would land on the visible rows and move them.
      if (!serverPainted && !sidePaintSavedRef.current) fillSidePaint(items);
    };
    const focus = parseHomeFeedFocus({
      tag: tagParam,
      ticker: tickerParam,
      place: placeParam,
    });

    if (walletLoading || !lensReady) return;

    const sessionKey = homeFeedSessionKey({
      lens: activeLens,
      sort,
      focusKey: homeFeedFocusKey(focus),
      accountId,
    });
    const restored = restoredSessionRef.current;
    // A stand confirmed after the snapshot was written makes its standing
    // sources stale — social lenses re-resolve instead of adopting it.
    const restoredStandStale =
      isHomeFeedSocialLens(activeLens) &&
      (restored?.standEpoch ?? 0) !== getViewerStandEpoch();
    // A boost after the snapshot was written makes Hot order stale — soft
    // refetch merges the new head while scroll stays put.
    const restoredAmplifyStale =
      sort === 'hot' &&
      (restored?.amplifyEpoch ?? 0) !== getViewerAmplifyEpoch();
    if (
      restored &&
      shouldKeepRestoredHomeFeed({
        restoredKey: restored.sessionKey,
        sessionKey,
        paintedKey: feedSessionKeyRef.current,
        restoredCount: restored.posts.length,
        paintedCount: postsLengthRef.current,
        reloadNonce,
        restoreReloadNonce: sessionRestoreReloadNonceRef.current,
        standStale: restoredStandStale,
        amplifyStale: restoredAmplifyStale,
      })
    ) {
      standingSourcesRef.current = restored.standingNetworkIds
        ? [...restored.standingNetworkIds]
        : null;
      setStandingNetworkIds(standingSourcesRef.current);
      feedSessionKeyRef.current = sessionKey;
      setSsrBootstrapDone(true);
      ssrBootstrapDoneRef.current = true;
      releaseColdLoad(postsRef.current);
      return;
    }

    // Speculative cold-start page — same adoption as the SSR hot seed below.
    if (
      shouldAdoptSpeculativeFeedPage({
        speculativePage,
        initialPage,
        hasFocus: focus != null,
        postsLength: postsLengthRef.current,
        bootstrapDone: ssrBootstrapDoneRef.current,
      }) &&
      speculativePage
    ) {
      setPosts(speculativePage.items);
      postsRef.current = speculativePage.items;
      postsLengthRef.current = speculativePage.items.length;
      setEngagementSeed((current) =>
        fillEngagementSeedFromFeedRows(current, speculativePage.items)
      );
      applyFeedPageCursor(speculativePage);
      feedSessionKeyRef.current = HOME_FEED_SSR_SESSION_KEY;
      if (speculativeFeedKeepsPaint(activeLens, sort)) {
        ssrHotGlobalSkipRef.current = true;
        ssrHotGlobalReloadNonceRef.current = reloadNonce;
        setSsrBootstrapDone(true);
        ssrBootstrapDoneRef.current = true;
        releaseColdLoad(speculativePage.items);
        return;
      }
      // Stored standing lens or Recent sort — keep these rows on screen
      // while the gated load below soft-refreshes into them.
    }

    // Paint SSR hot feed immediately; standing / non-hot sorts soft-upgrade.
    const canUseSsrBootstrap =
      !ssrBootstrapDoneRef.current &&
      initialPage != null &&
      !focus &&
      sort === 'hot' &&
      (walletLoading || !lensReady || activeLens === 'global');

    if (canUseSsrBootstrap) {
      setSsrBootstrapDone(true);
      ssrBootstrapDoneRef.current = true;
      isLoadingRef.current = false;
      isRefreshingRef.current = false;
      setIsLoading(false);
      // Assume SSR hot matches until standing lens needs a client upgrade.
      ssrHotGlobalSkipRef.current = true;
      ssrHotGlobalReloadNonceRef.current = reloadNonce;
      // Soft-upgrade standing once wallet + lens are ready.
      if (walletLoading || !lensReady) return;
      if (!isHomeFeedSocialLens(activeLens) || !accountId) return;
      ssrHotGlobalSkipRef.current = false;
    }

    if (focus || sort !== 'hot' || activeLens !== 'global') {
      ssrHotGlobalSkipRef.current = false;
    }

    // Second effect run after wallet/lens ready still skips duplicate global/hot.
    if (
      ssrHotGlobalSkipRef.current &&
      !focus &&
      sort === 'hot' &&
      activeLens === 'global' &&
      reloadNonce === ssrHotGlobalReloadNonceRef.current
    ) {
      releaseColdLoad(postsRef.current);
      return;
    }

    // Stored Recent (or other non-hot): keep hot SSR rows visible while
    // soft-refreshing into the preferred sort.
    if (
      !focus &&
      initialPage != null &&
      sort !== 'hot' &&
      !ssrBootstrapDoneRef.current &&
      postsLengthRef.current > 0
    ) {
      // Fall through with keepPrevious below.
    }

    // Explicit reload (amplify reconcile, pull) may refresh global hot once.
    if (
      ssrHotGlobalSkipRef.current &&
      activeLens === 'global' &&
      sort === 'hot' &&
      !focus
    ) {
      ssrHotGlobalReloadNonceRef.current = reloadNonce;
    }

    const loadId = ++loadIdRef.current;
    appendInFlightRef.current = false;
    const previousStandingSources = standingSourcesRef.current;
    const previousNextOffset = nextOffsetRef.current;
    const previousBefore = nextBeforeBlockHeightRef.current;
    const previousBeforeHeat = nextBeforeHeatRef.current;
    const previousBeforeKey = nextBeforeEventKeyRef.current;
    hiddenWalksRef.current = 0;
    setHiddenWalkGaveUp(false);
    setEngagementError(null);
    setLoadError(null);
    clearUnseenPosts();

    const mergeHead =
      feedSessionKeyRef.current === sessionKey && postsLengthRef.current > 0;
    if (!mergeHead) {
      offsetShiftAppliedRef.current = 0;
    }

    const keepPrevious = postsLengthRef.current > 0;
    if (keepPrevious) {
      const refresh = slowRefreshReveal();
      isRefreshingRef.current = refresh.refreshing;
      isLoadingRef.current = refresh.loading;
      setIsRefreshing(refresh.refreshing);
      setIsLoading(refresh.loading);
    } else {
      standingSourcesRef.current = null;
      setStandingNetworkIds(null);
      isLoadingRef.current = true;
      isRefreshingRef.current = false;
      setIsLoading(true);
      setIsRefreshing(false);
      clearFeedPageCursor();
    }
    setIsLoadingMore(false);

    void (async () => {
      try {
        const result = focus
          ? {
              page: await loadFocusedFeedPage(focus, { offset: 0 }, { sort }),
              standingSources: null as string[] | null,
            }
          : await fetchHomeFeedPageClient(
              activeLens,
              accountId,
              { offset: 0 },
              null,
              sort
            );

        if (!isCurrentLoadingRequest(loadIdRef.current, loadId)) return;

        const standingArriving =
          Boolean(result.standingSources?.length) &&
          !standingSourcesRef.current?.length;
        if (standingArriving && postsLengthRef.current > 0) {
          // Standing peeks attach under painted blocks — hold before paint.
          holdFeedScrollAnchor();
        }
        standingSourcesRef.current = result.standingSources;
        setStandingNetworkIds(result.standingSources);
        const items = result.page.items;
        let insertedCount = 0;
        let hotHeadChanged = false;
        if (mergeHead && sort === 'hot' && postsLengthRef.current > 0) {
          // Keep the visible card glued while Hot reorders above/below.
          holdFeedScrollAnchor();
        }
        let risingAuthors: string[] = [];
        // Rows + public count seed first. Quotes/tallies/DAO and the full
        // engagement map (amplify gaps) soft-fill — never block setPosts.
        setPosts((current) => {
          if (mergeHead && current.length > 0) {
            const merged =
              sort === 'hot'
                ? mergeHotFeedHead(current, items)
                : mergeHomeFeedHead(current, items);
            insertedCount = merged.insertedCount;
            if (sort === 'hot') {
              hotHeadChanged = hotFeedHeadOrderChanged(current, merged.posts);
              if (hotHeadChanged) {
                risingAuthors = hotFeedRisingAuthorIds(current, merged.posts);
              }
            }
            revokeDroppedOptimisticMedia(current, merged.posts);
            return merged.posts;
          }
          revokeDroppedOptimisticMedia(current, items);
          return items;
        });
        setEngagementSeed((current) =>
          fillEngagementSeedFromFeedRows(current, items)
        );
        feedSessionKeyRef.current = sessionKey;
        if (mergeHead) {
          growFeedWindow(insertedCount);
          if (
            hotHeadChanged &&
            feedScrollTop() > HOME_FEED_HOT_UPDATED_SCROLL_PX
          ) {
            armHotUpdated(risingAuthors);
          }
        } else {
          applyFeedPageCursor(result.page);
          clearHotUpdated();
        }
        setSsrBootstrapDone(true);
        ssrBootstrapDoneRef.current = true;
        fillSidePaint(items);
        if (!mergeHead) {
          void loadPostEngagementMap(createReadOnlyOnSocialClient(), items, {
            viewer: accountId,
          }).then(
            (engagement) => {
              if (!isCurrentLoadingRequest(loadIdRef.current, loadId)) return;
              setEngagementSeed((current) => ({
                ...(current ?? {}),
                ...engagement,
              }));
            },
            () => {
              // Row seed already holds public counts.
            }
          );
        }
      } catch (cause) {
        if (!isCurrentLoadingRequest(loadIdRef.current, loadId)) return;
        const message =
          cause instanceof Error ? cause.message : 'Could not load feed.';
        setLoadError(message);
        if (keepPrevious) {
          standingSourcesRef.current = previousStandingSources;
          setStandingNetworkIds(previousStandingSources);
          setNextOffset(previousNextOffset);
          nextOffsetRef.current = previousNextOffset;
          setNextBeforeBlockHeight(previousBefore);
          nextBeforeBlockHeightRef.current = previousBefore;
          setNextBeforeHeat(previousBeforeHeat);
          nextBeforeHeatRef.current = previousBeforeHeat;
          setNextBeforeEventKey(previousBeforeKey);
          nextBeforeEventKeyRef.current = previousBeforeKey;
        } else {
          setPosts([]);
          clearFeedPageCursor();
        }
      } finally {
        if (isCurrentLoadingRequest(loadIdRef.current, loadId)) {
          isLoadingRef.current = false;
          isRefreshingRef.current = false;
          setIsLoading(false);
          setIsRefreshing(false);
          setIsLoadingMore(false);
        }
      }
    })();

    return () => {
      loadIdRef.current += 1;
    };
  }, [
    accountId,
    activeFocusKey,
    activeLens,
    applyFeedPageCursor,
    armHotUpdated,
    clearFeedPageCursor,
    clearHotUpdated,
    clearUnseenPosts,
    feedScrollTop,
    holdFeedScrollAnchor,
    initialPage,
    serverPainted,
    lensReady,
    reloadNonce,
    sort,
    speculativePage,
    tagParam,
    tickerParam,
    placeParam,
    walletLoading,
    growFeedWindow,
  ]);

  const loadMore = useCallback(() => {
    // Never race a full load / soft refresh — a load-more here would bump
    // loadIdRef, cancel the refresh, and append onto a stale list.
    if (
      !canStartHomeFeedAppend({
        appendInFlight: appendInFlightRef.current,
        isLoading: isLoadingRef.current,
        isRefreshing: isRefreshingRef.current,
      })
    ) {
      return;
    }
    const beforeHeight = nextBeforeBlockHeightRef.current;
    const beforeHeat = nextBeforeHeatRef.current;
    const beforeKey = nextBeforeEventKeyRef.current?.trim();
    // Keyset-complete only — never offset load-more (page-1 replay risk).
    if (
      beforeHeight === undefined ||
      !beforeKey ||
      (sort === 'hot' && beforeHeat === undefined)
    ) {
      return;
    }

    const focus = parseHomeFeedFocus({
      tag: tagParam,
      ticker: tickerParam,
      place: placeParam,
    });

    const cursor: HomeFeedPageCursor = {
      beforeBlockHeight: beforeHeight,
      beforeEventHeight: beforeHeight,
      beforeEventHeat: beforeHeat,
      beforeEventKey: beforeKey,
    };

    const loadId = ++loadIdRef.current;
    appendInFlightRef.current = true;
    setIsLoadingMore(true);
    setLoadError(null);

    void (async () => {
      try {
        const result = focus
          ? {
              page: await loadFocusedFeedPage(focus, cursor, { sort }),
              standingSources: standingSourcesRef.current,
            }
          : await fetchHomeFeedPageClient(
              activeLens,
              accountId,
              cursor,
              standingSourcesRef.current,
              sort
            );

        if (!isCurrentLoadingRequest(loadIdRef.current, loadId)) return;

        if (result.standingSources) {
          const standingArriving =
            Boolean(result.standingSources.length) &&
            !standingSourcesRef.current?.length;
          if (standingArriving && postsLengthRef.current > 0) {
            holdFeedScrollAnchor();
          }
          standingSourcesRef.current = result.standingSources;
          setStandingNetworkIds(result.standingSources);
        }

        if (postsLengthRef.current > 0) {
          // Append can join an orphan into its parent (or Focus Hot re-rank).
          // Hold so coalesce height growth does not move the reader.
          holdFeedScrollAnchor();
        }
        const appended = result.page.items;
        // Keep the accumulated list on append — sync head trim orphans
        // scroll-up. Idle memory trim bounds the JS working set after
        // scroll settles; DOM windowing already bounds render.
        setPosts((current) => {
          const merged = mergeFeedPosts(current, appended);
          return focus != null && sort === 'hot'
            ? sortPostsByHot(merged)
            : merged;
        });
        setEngagementSeed((current) =>
          fillEngagementSeedFromFeedRows(current, appended)
        );
        applyFeedPageCursor(result.page);
        // Soft-fill after rows mount — quotes + counts/colour in one map.
        void Promise.all([
          loadFeedPaint(appended),
          loadPostEngagementMap(createReadOnlyOnSocialClient(), appended, {
            viewer: accountId,
          }),
        ]).then(
          ([appendedPaint, appendedEngagement]) => {
            if (!isCurrentLoadingRequest(loadIdRef.current, loadId)) return;
            sidePaintSavedRef.current = true;
            setQuotedSeed((current) => ({
              ...current,
              ...appendedPaint.quoted,
            }));
            setPollSeed((current) => ({
              ...current,
              ...appendedPaint.tallies,
            }));
            setDaoSeed((current) => ({
              ...current,
              ...appendedPaint.memberships,
            }));
            setEngagementSeed((current) => ({
              ...(current ?? {}),
              ...appendedEngagement,
            }));
          },
          () => {
            // Rows stay; row seed already holds public counts.
          }
        );
      } catch (cause) {
        // Keep the current list; restore the keyset so Retry can append again.
        if (isCurrentLoadingRequest(loadIdRef.current, loadId)) {
          nextBeforeBlockHeightRef.current = beforeHeight;
          setNextBeforeBlockHeight(beforeHeight);
          nextBeforeHeatRef.current = beforeHeat;
          setNextBeforeHeat(beforeHeat);
          nextBeforeEventKeyRef.current = beforeKey;
          setNextBeforeEventKey(beforeKey);
          const painted = countVisibleHomeFeedCards(
            filterHiddenAuthors(postsRef.current),
            {
              includeForeignReplies: homeFeedIncludeForeignReplies(
                activeLens,
                focus != null
              ),
            }
          );
          if (painted === 0) {
            setLoadError('Could not load feed.');
          } else {
            setLoadError(
              cause instanceof Error
                ? cause.message
                : 'Could not load more posts.'
            );
          }
        }
      } finally {
        if (isCurrentLoadingRequest(loadIdRef.current, loadId)) {
          setIsLoadingMore(false);
          appendInFlightRef.current = false;
          // Idle trim after append settles — never sync-trim inside setPosts.
          scheduleMemoryTrimRef.current();
        }
      }
    })();
  }, [
    accountId,
    activeLens,
    applyFeedPageCursor,
    holdFeedScrollAnchor,
    sort,
    tagParam,
    tickerParam,
    placeParam,
  ]);

  const hasMore = homeFeedHasMore({
    nextBeforeBlockHeight,
    nextBeforeEventKey,
    nextBeforeHeat,
  });
  const showLoadMoreSentinel = hasMore && visibleCardCount > 0;
  const walkingHiddenPage =
    visibleCardCount === 0 && hasMore && !loadError && !hiddenWalkGaveUp;

  useInfiniteScrollSentinel({
    scrollRootRef,
    sentinelRef: loadMoreRef,
    enabled:
      showLoadMoreSentinel && !isLoading && !isLoadingMore && !isRefreshing,
    onIntersect: loadMore,
    // ~1–1.5 viewports of lead: page two starts before the footer dots
    // reach the fold on cold visits.
    rootMargin: '1400px 0px',
  });

  useEffect(() => {
    if (
      !walkingHiddenPage ||
      isLoading ||
      isRefreshing ||
      isLoadingMore ||
      loadError
    ) {
      return;
    }
    if (hiddenWalksRef.current >= 4) {
      setHiddenWalkGaveUp(true);
      return;
    }
    hiddenWalksRef.current += 1;
    loadMore();
  }, [
    isLoading,
    isLoadingMore,
    isRefreshing,
    loadError,
    loadMore,
    walkingHiddenPage,
  ]);

  const clearFocusSearch = useCallback(() => {
    router.replace(homeFeedFocusClearPath(), { scroll: false });
  }, [router]);

  const handleLensChange = useCallback(
    (next: HomeFeedLens) => {
      const resolved = resolveHomeFeedLens(next, isConnected);
      setLens(resolved);
      writeStoredHomeFeedLens(resolved);
      clearFocusSearch();
    },
    [clearFocusSearch, isConnected]
  );

  const handleCommitFocus = useCallback(
    (focus: HomeFeedFocus) => {
      router.replace(homeFeedFocusPath(focus), { scroll: false });
    },
    [router]
  );

  const handleAddSavedFeed = useCallback(
    (focus: HomeFeedFocus) => {
      setSavedFeeds(addHomeSavedFeed(focus));
      handleCommitFocus(focus);
    },
    [handleCommitFocus]
  );

  const handleSelectSavedFeed = useCallback(
    (feed: HomeSavedFeed) => {
      handleCommitFocus(homeSavedFeedFocus(feed));
    },
    [handleCommitFocus]
  );

  const handleRemoveSavedFeed = useCallback(
    (id: string) => {
      const removed = savedFeeds.find((feed) => feed.id === id);
      setSavedFeeds(removeHomeSavedFeed(id));
      if (
        removed &&
        activeFocusKey &&
        homeFeedFocusKey(homeSavedFeedFocus(removed)) === activeFocusKey
      ) {
        clearFocusSearch();
      }
    },
    [activeFocusKey, clearFocusSearch, savedFeeds]
  );

  const retryLoad = useCallback(() => {
    setReloadNonce((value) => value + 1);
  }, []);

  const retainFeedWindowHeights = useCallback((kept: readonly PostRow[]) => {
    const blocks = coalesceFeedThreads([...kept], {
      includeForeignReplies: includeForeignRepliesRef.current,
      stoodWithAccountIds: stoodWithAccountIdsRef.current,
    });
    const assigned = assignStableFeedBlockKeys(
      blocks,
      feedBlockKeyStateRef.current
    );
    feedBlockKeyStateRef.current = assigned.state;
    feedWindowCacheRef.current?.retain(assigned.keys);
  }, []);

  /** Clamp cursors, revoke media, retain heights after any working-set cut. */
  const commitTrimmedWorkingSet = useCallback(
    (kept: PostRow[], current: PostRow[]): PostRow[] => {
      if (kept.length === current.length) return current;
      revokeDroppedOptimisticMedia(current, kept);
      const clamped = clampHomeFeedCursorAfterTrim({
        posts: kept,
        nextOffset: nextOffsetRef.current,
        nextBeforeBlockHeight: nextBeforeBlockHeightRef.current,
        nextBeforeHeat: nextBeforeHeatRef.current,
        nextBeforeEventKey: nextBeforeEventKeyRef.current,
        offsetShiftApplied: offsetShiftAppliedRef.current,
      });
      nextOffsetRef.current = clamped.nextOffset;
      setNextOffset(clamped.nextOffset);
      nextBeforeBlockHeightRef.current = clamped.nextBeforeBlockHeight;
      setNextBeforeBlockHeight(clamped.nextBeforeBlockHeight);
      nextBeforeHeatRef.current = clamped.nextBeforeHeat;
      setNextBeforeHeat(clamped.nextBeforeHeat);
      nextBeforeEventKeyRef.current = clamped.nextBeforeEventKey;
      setNextBeforeEventKey(clamped.nextBeforeEventKey);
      offsetShiftAppliedRef.current = clamped.offsetShiftApplied;
      retainFeedWindowHeights(kept);
      return kept;
    },
    [retainFeedWindowHeights]
  );

  const trimFarBelowAfterJump = useCallback(() => {
    setPosts((current) => {
      const { posts: kept } = trimHomeFeedWorkingSetKeepingHead(current);
      return commitTrimmedWorkingSet(kept, current);
    });
  }, [commitTrimmedWorkingSet]);

  const maybeTrimFeedMemory = useCallback(() => {
    if (
      isLoadingRef.current ||
      isRefreshingRef.current ||
      appendInFlightRef.current ||
      isLoadingMoreRef.current ||
      reRankAnchorRef.current
    ) {
      return;
    }
    const root = scrollRootRef.current;
    if (root?.classList.contains(FEED_CATCH_UP_SCROLLING_CLASS)) return;
    const current = postsRef.current;
    if (current.length <= HOME_FEED_WORKING_SET_POSTS) return;
    const range = feedWindowRangeRef.current;
    const trimmed = planHomeFeedMemoryTrim({
      posts: current,
      scrollTop: feedScrollTop(),
      windowStart: range.start,
      windowEnd: range.end,
      includeForeignReplies: includeForeignRepliesRef.current,
      stoodWithAccountIds: stoodWithAccountIdsRef.current,
    });
    if (
      trimmed.droppedHead.length === 0 &&
      trimmed.droppedTail.length === 0
    ) {
      return;
    }
    // Head drop shifts document flow — pin the visible row for one restore.
    // Tail-only cuts leave scroll alone.
    if (homeFeedMemoryTrimNeedsScrollAnchor(trimmed)) {
      holdFeedScrollAnchor();
    }
    setPosts((live) => {
      // Append / refresh won the race — leave their list alone.
      if (live !== current) return live;
      return commitTrimmedWorkingSet(trimmed.posts, live);
    });
  }, [commitTrimmedWorkingSet, feedScrollTop, holdFeedScrollAnchor]);

  const scheduleMemoryTrim = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (memoryTrimTimerRef.current != null) {
      window.clearTimeout(memoryTrimTimerRef.current);
    }
    memoryTrimTimerRef.current = window.setTimeout(() => {
      memoryTrimTimerRef.current = null;
      maybeTrimFeedMemory();
    }, HOME_FEED_MEMORY_TRIM_IDLE_MS);
  }, [maybeTrimFeedMemory]);
  scheduleMemoryTrimRef.current = scheduleMemoryTrim;

  const onWindowRangeChange = useCallback((range: FeedWindowRangeChange) => {
    feedWindowRangeRef.current = range;
  }, []);

  const onBlockKeyState = useCallback((state: FeedBlockKeyState[]) => {
    feedBlockKeyStateRef.current = state;
  }, []);

  useEffect(() => {
    const node = scrollRootRef.current;
    if (!(node instanceof HTMLElement)) return;
    // Lenis animates scrollTop with untrusted events — still note the line
    // and schedule idle trim. Catch-up / re-rank guards live inside trim.
    const onScroll = () => {
      noteHomeFeedSessionScroll(node.scrollTop);
      scheduleMemoryTrim();
    };
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      node.removeEventListener('scroll', onScroll);
      if (memoryTrimTimerRef.current != null) {
        window.clearTimeout(memoryTrimTimerRef.current);
        memoryTrimTimerRef.current = null;
      }
    };
  }, [posts.length, scheduleMemoryTrim]);

  const applyNewPosts = useCallback(() => {
    clearUnseenPosts();
    clearHotUpdated();
    scrollFeedToNewest(scrollRootRef.current);
    // Reload replaces the list; trim far-below first so the underlay sheds
    // weight before the soft refresh paints.
    trimFarBelowAfterJump();
    setReloadNonce((value) => value + 1);
  }, [clearHotUpdated, clearUnseenPosts, trimFarBelowAfterJump]);

  const jumpToHotUpdated = useCallback(() => {
    // Keep the chip mounted through the ease — unmounting first flickers.
    scrollFeedToNewest(scrollRootRef.current, {
      onComplete: () => {
        trimFarBelowAfterJump();
        clearHotUpdated();
      },
    });
  }, [clearHotUpdated, trimFarBelowAfterJump]);

  const probeNewPosts = useCallback(async () => {
    const focus = parseHomeFeedFocus({
      tag: tagParam,
      ticker: tickerParam,
      place: placeParam,
    });
    if (
      !lensReady ||
      walletLoading ||
      !homeFeedShowsTimelineChrome(activeLens, focus != null) ||
      isLoadingRef.current ||
      isRefreshingRef.current ||
      newPostsProbeInFlightRef.current ||
      postsLengthRef.current === 0 ||
      (typeof document !== 'undefined' && document.visibilityState === 'hidden')
    ) {
      return;
    }

    newPostsProbeInFlightRef.current = true;

    try {
      // Always probe chronological head so “new” means newer content, not Hot churn.
      const result = focus
        ? {
            page: await loadFocusedFeedPage(focus, { offset: 0 }, {
              limit: HOME_FEED_NEW_PROBE_SIZE,
            }),
          }
        : await fetchHomeFeedPageClient(
            activeLens,
            accountId,
            { offset: 0 },
            standingSourcesRef.current,
            'recent',
            HOME_FEED_NEW_PROBE_SIZE,
            { fillVisible: false }
          );

      if (
        isLoadingRef.current ||
        isRefreshingRef.current ||
        postsLengthRef.current === 0
      ) {
        return;
      }

      const summary = summarizeUnseenFeedPosts(
        result.page.items,
        seenPostKeysRef.current,
        {
          includeForeignReplies: Boolean(focus),
          viewerAccountId: accountId,
          stoodWithAccountIds: focus ? undefined : stoodWithAccountIds,
        }
      );
      // A probe with no news must not re-render the feed — keep the prior
      // state object when the summary is unchanged.
      setUnseenPosts((prev) =>
        unseenFeedSummariesEqual(prev, summary) ? prev : summary
      );

      // The head probe only sees new posts — reconcile edits/deletions of
      // rows already on screen. Runs inside the try: a failed state query
      // must never remove rows.
      const reconcileTargets = selectFeedReconcileTargets(postsRef.current);
      if (
        reconcileTargets.length > 0 &&
        canRunHomeFeedReconcile({
          isLoading: isLoadingRef.current,
          isRefreshing: isRefreshingRef.current,
          postCount: postsLengthRef.current,
        })
      ) {
        const reader = createReadOnlyOnSocialClient();
        const freshRows = await reader.query.feed.statesByIds(reconcileTargets);
        if (
          canRunHomeFeedReconcile({
            isLoading: isLoadingRef.current,
            isRefreshing: isRefreshingRef.current,
            postCount: postsLengthRef.current,
          })
        ) {
          const { next, removedKeys, updatedKeys } = reconcileFeedRows(
            postsRef.current,
            freshRows,
            reconcileTargets
          );
          // The posts-effect sync resyncs postsRef/length/seen keys.
          if (
            feedListMutationNeedsScrollAnchor({ removedKeys, updatedKeys })
          ) {
            holdFeedScrollAnchor();
            setPosts(next);
          }
        }
      }
    } catch {
      // Quiet — pill is best-effort; list stays as-is.
    } finally {
      newPostsProbeInFlightRef.current = false;
    }
  }, [
    accountId,
    activeLens,
    holdFeedScrollAnchor,
    lensReady,
    stoodWithAccountIds,
    tagParam,
    tickerParam,
    placeParam,
    walletLoading,
  ]);

  useEffect(() => {
    if (!lensReady || walletLoading) return;

    const tick = () => {
      const root = scrollRootRef.current;
      if (root?.closest('[data-feed-session="covered"]')) return;
      void probeNewPosts();
    };

    const warmupId = window.setTimeout(
      tick,
      homeFeedSessionProbeDelayMs(Boolean(restoredSessionRef.current))
    );
    const intervalId = window.setInterval(tick, HOME_FEED_NEW_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearTimeout(warmupId);
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [lensReady, probeNewPosts, walletLoading]);

  const destinationLabel = useMemo(
    () => (accountId ? `@${accountId} · Public` : 'Public'),
    [accountId]
  );

  const onConfirmed = useCallback(
    (post: PostRow, parent?: PostRow | null) => {
      if (!shouldPrependOptimisticFeedPost(post)) return;
      clearUnseenPosts();
      let grown = 0;
      setPosts((current) => {
        const next = insertOptimisticFeedPost(current, post, parent);
        grown = next.length - current.length;
        return next;
      });
      // One new card at the head — not raw rows (reply + parent is still 1).
      if (grown > 0) growFeedWindow(1);
      // A covered sheet owns the gesture — do not ease the parked underlay
      // through every virtual band (that is what made long sessions sluggish).
      const root = scrollRootRef.current;
      if (root?.closest('[data-feed-session="covered"]')) return;
      scrollFeedToNewest(root);
    },
    [clearUnseenPosts, growFeedWindow]
  );

  const onUnreposted = useCallback(
    (target: PostRow) => {
      if (!accountId) return;
      const targetPath = postContentPath(target);
      setPosts((current) =>
        current.filter(
          (row) =>
            !(
              row.accountId === accountId &&
              row.refType === 'repost' &&
              row.refPath === targetPath
            )
        )
      );
    },
    [accountId]
  );

  useEffect(() => subscribePersonalPostConfirmed(onConfirmed), [onConfirmed]);
  useEffect(
    () =>
      subscribePersonalReplyConfirmed(({ parent, reply }) => {
        onConfirmed(reply, parent);
      }),
    [onConfirmed]
  );

  // A stand confirmed anywhere in the tab re-resolves social-lens sources.
  useEffect(() => {
    if (!isHomeFeedSocialLens(activeLens)) return;
    return subscribeViewerStandConfirmed(() => {
      setReloadNonce((value) => value + 1);
    });
  }, [activeLens]);

  // Boost confirmed — offer Hot catch-up when mid-feed, then soft-refresh.
  useEffect(() => {
    return subscribeViewerAmplifyConfirmed(({ authorId }) => {
      if (sort !== 'hot') return;
      if (feedScrollTop() > HOME_FEED_HOT_UPDATED_SCROLL_PX) {
        armHotUpdated(authorId ? [authorId] : []);
      }
      setReloadNonce((value) => value + 1);
    });
  }, [armHotUpdated, feedScrollTop, sort]);

  const pathname = usePathname();
  const {
    openReply,
    openFullReply,
    openQuote,
    openRepost,
    openUndoRepost,
    sheet,
  } = usePersonalComposer({
    registerPen: Boolean(isConnected && accountId),
    replyDockEnabled: pathname === APP_HOME_PATH,
    destinationLabel,
    onConfirmed,
    onUnreposted,
  });

  const replyHandler = openReply;
  const quoteHandler = isConnected ? openQuote : undefined;
  const repostHandler = isConnected ? openRepost : undefined;
  const undoRepostHandler = isConnected ? openUndoRepost : undefined;

  const emptyCopy = activeFocus
    ? homeFeedFocusEmptyCopy(activeFocus)
    : homeFeedLensEmptyCopy(activeLens);

  const hasPaintedRows = visibleCardCount > 0;
  const loadingPresentation = isLoadingMore
    ? resolveAppLoadingPresentation('appending', { hasPaintedRows })
    : isLoading
      ? resolveAppLoadingPresentation('cold', { hasPaintedRows })
      : isRefreshing
        ? resolveAppLoadingPresentation('refreshing', { hasPaintedRows })
        : null;
  const errorPresentation = loadError
    ? resolveAppLoadingPresentation('error', { hasPaintedRows })
    : null;
  const showColdSkeleton =
    loadingPresentation === 'skeleton' ||
    (walkingHiddenPage && !isRefreshing && !isLoading);
  const showAppendPending = loadingPresentation === 'append-pending';
  const showEmpty =
    !isLoading &&
    !isRefreshing &&
    !isLoadingMore &&
    !loadError &&
    visibleCardCount === 0 &&
    (!hasMore || hiddenWalkGaveUp);
  const showFeed = visibleCardCount > 0;
  const pullRefresh = useHomeFeedPullRefresh({
    scrollRootRef,
    refreshing: isRefreshing,
    loading: isLoading,
    loadingMore: isLoadingMore,
    hasRows: showFeed,
    onRefresh: retryLoad,
  });
  const newPostsCountLabel = homeFeedNewPostsCountLabel(unseenPosts.count);
  const showNewPostsPill =
    Boolean(newPostsCountLabel) && showFeed && !isRefreshing && !isLoading;
  // Keep visible through soft-refresh — boost sets the flag before reload.
  const showHotUpdatedPill =
    hotUpdated && !showNewPostsPill && showFeed && !isLoading;
  const toolbarHidden = useDockAutoHide(false, scrollRootRef);
  return (
    <HomeActiveFocusProvider focus={activeFocus}>
      <OsAppScreen
        title="Home"
        compactChrome
        glassChrome
        scrollRootRef={scrollRootRef}
        leading={null}
        toolbar={
          <OsAppChromeToolbarRail
            hidden={toolbarHidden}
            className="home-feed-compact-chrome"
          >
            <Link
              href={APP_DISCOVER_PATH}
              className="home-feed-discover-link"
              aria-label="Discover"
              title="Discover"
              scroll={false}
            >
              <OnSocialMark className="home-feed-discover-mark" aria-hidden />
            </Link>
            <HomeFeedChipBar
              lens={activeLens}
              onLensChange={handleLensChange}
              standingAvailable={isConnected}
              savedFeeds={savedFeeds}
              activeFocus={activeFocus}
              onSelectSavedFeed={handleSelectSavedFeed}
              onRemoveSavedFeed={handleRemoveSavedFeed}
              onClearFocus={clearFocusSearch}
              onNewFeed={() => setSavedFeedSheetOpen(true)}
            />
            {homeFeedShowsTimelineChrome(activeLens, activeFocus != null) ? (
              <HomeFeedSortToggle sort={sort} onSortChange={handleSortChange} />
            ) : null}
          </OsAppChromeToolbarRail>
        }
      >
        <OsAppChromePage className="home-feed">
          {loadError ? (
            errorPresentation === 'overlay' ? (
              <OsChromeListAlert message={loadError} onRetry={retryLoad} />
            ) : (
              <ListLoadError message={loadError} onRetry={retryLoad} />
            )
          ) : null}

          {engagementError ? (
            <OsChromeListAlert message={engagementError} />
          ) : null}

          <HomeFeedReveal
            showSkeleton={showColdSkeleton && !showFeed}
            skeleton={
              <PostRowSkeleton
                rows={4}
                frames={HOME_FEED_COLD_SKELETON_FRAMES}
              />
            }
          >
            {showEmpty ? (
              <OsPageBodyAppear>
                <div className="home-feed-state">{emptyCopy}</div>
              </OsPageBodyAppear>
            ) : showFeed ? (
              <>
                <PersonalFeedList
                  posts={visiblePosts}
                  includeForeignReplies={includeForeignReplies}
                  stoodWithAccountIds={stoodWithAccountIds}
                  showGuildAttribution
                  className={`home-feed-list${isRefreshing ? ' is-refreshing' : ''}`}
                  initialEngagement={engagementSeed}
                  initialScarceEmbeds={initialScarceEmbeds}
                  quotedSeed={quotedSeed}
                  pollSeed={pollSeed}
                  daoMemberships={daoSeed}
                  windowSizeCache={feedWindowCacheRef.current}
                  pinnedFeedKey={reRankAnchor?.key ?? null}
                  onWindowRangeChange={onWindowRangeChange}
                  onBlockKeyState={onBlockKeyState}
                  onReply={replyHandler}
                  onExpandReply={openFullReply}
                  onQuote={quoteHandler}
                  onRepost={repostHandler}
                  onUndoRepost={undoRepostHandler}
                  onEngagementError={(message) => setEngagementError(message)}
                />
                <HomeFeedLoadMoreFooter
                  loadMoreSentinelRef={loadMoreRef}
                  showSentinel={showLoadMoreSentinel}
                  showAppendPending={showAppendPending}
                />
              </>
            ) : null}
          </HomeFeedReveal>

          {sheet}
        </OsAppChromePage>

        <HomeFeedPullIndicator subscribe={pullRefresh.subscribe} />

        {showNewPostsPill ? (
          <HomeFeedNewPostsChip summary={unseenPosts} onClick={applyNewPosts} />
        ) : null}
        {showHotUpdatedPill ? (
          <HomeFeedHotUpdatedChip
            authorIds={hotUpdatedAuthors}
            onClick={jumpToHotUpdated}
          />
        ) : null}
      </OsAppScreen>

      <HomeSavedFeedSheet
        open={savedFeedSheetOpen}
        onClose={() => setSavedFeedSheetOpen(false)}
        onAddFocus={handleAddSavedFeed}
        existingFocusKeys={savedFocusKeys}
      />
    </HomeActiveFocusProvider>
  );
}
