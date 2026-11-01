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
} from '@onsocial/ui';
import type { PostEngagement } from '@/hooks/use-post-engagement';
import { OsChromeListAlert } from '@/components/chrome/os-chrome-whisper';
import { ListLoadError } from '@/components/panels/list-load-error';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { HomeFeedChipBar } from '@/features/home/home-feed-chip-bar';
import { HomeFeedNewPostsChip } from '@/features/home/home-feed-new-posts-chip';
import { HomeFeedPullIndicator } from '@/features/home/home-feed-pull-indicator';
import { useHomeFeedPullRefresh } from '@/features/home/use-home-feed-pull-refresh';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';
import { HomeFeedSortToggle } from '@/features/home/home-feed-sort-toggle';
import { APP_DISCOVER_PATH, APP_HOME_PATH } from '@/lib/app-routes';
import {
  captureVisibleFeedAnchor,
  restoreFeedAnchor,
  type FeedScrollAnchor,
} from '@/features/home/home-feed-scroll-anchor';
import { FeedWindowSizeCache } from '@/features/home/feed-window';
import {
  collectOutgoingStandingSources,
  fetchCircleFeedPage,
  fetchPulseFeedPage,
  isHomeFeedSocialLens,
} from '@/features/home/home-feed-pulse';
import {
  collectResolvedSavePage,
  countVisibleHomeFeedCards,
  fillVisibleFeedPage,
  homeFeedIncludeForeignReplies,
  homeFeedShowsTimelineChrome,
} from '@/features/home/home-feed-visible';
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
  HOME_FEED_APPEND_SKELETON_FRAMES,
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
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  fetchIndexedPostsByRefs,
  indexedPostRefKey,
} from '@/lib/fetch-personal-post';
import { parseSaveContentPath } from '@/lib/save-content-path';
import {
  EMPTY_UNSEEN_FEED_SUMMARY,
  feedPostKeySet,
  HOME_FEED_NEW_POLL_MS,
  HOME_FEED_NEW_PROBE_SIZE,
  homeFeedNewPostsCountLabel,
  mergeHomeFeedHead,
  pendingFeedOffsetShift,
  summarizeUnseenFeedPosts,
  unseenFeedSummariesEqual,
  type UnseenFeedSummary,
} from '@/lib/home-feed-new-posts';
import {
  HOME_FEED_SSR_SESSION_KEY,
  homeFeedSessionKey,
  homeFeedSessionProbeDelayMs,
  noteHomeFeedSessionScroll,
  peekHomeFeedSession,
  writeHomeFeedSession,
} from '@/lib/home-feed-session';
import { scrollFeedToNewest } from '@/lib/feed-scroll-to-newest';
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

const HOME_FEED_PAGE_SIZE = 24;

async function fetchSavedFeedPage(
  accountId: string,
  offset: number,
  limit: number
): Promise<Paginated<PostRow>> {
  const client = createReadOnlyOnSocialClient();
  return collectResolvedSavePage({
    offset,
    limit,
    loadRefs: async (pageOffset, pageLimit) => {
      const saves = await client.query.saves.list(accountId, {
        limit: pageLimit,
        offset: pageOffset,
      });
      return saves.map((row) => parseSaveContentPath(row.contentPath));
    },
    hydrate: (refs) => fetchIndexedPostsByRefs([...refs]),
    refKey: (ref) => indexedPostRefKey(ref.author, ref.postId),
  });
}

function mergeFeedPosts(current: PostRow[], incoming: PostRow[]): PostRow[] {
  if (incoming.length === 0) return current;

  const seen = new Set(current.map(postKey));
  const merged = [...current];

  for (const post of incoming) {
    const key = postKey(post);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(post);
  }

  return merged;
}

async function resolveStandingSources(accountId: string): Promise<string[]> {
  const client = createReadOnlyOnSocialClient();
  return collectOutgoingStandingSources(accountId, (id, opts) =>
    client.query.standings.outgoing(id, opts)
  );
}

async function fetchHomeFeedPageClient(
  lens: HomeFeedLens,
  accountId: string | null,
  offset: number,
  standingSources: string[] | null,
  sort: HomeFeedSort,
  limit: number = HOME_FEED_PAGE_SIZE,
  options: { fillVisible?: boolean } = {}
): Promise<{ page: Paginated<PostRow>; standingSources: string[] | null }> {
  const client = createReadOnlyOnSocialClient();

  if (lens === 'saved' && accountId) {
    const page = await fetchSavedFeedPage(accountId, offset, limit);
    return { page, standingSources: null };
  }

  if (isHomeFeedSocialLens(lens) && accountId) {
    const sources =
      standingSources ?? (await resolveStandingSources(accountId));

    if (sources.length === 0) {
      return { page: { items: [] }, standingSources: sources };
    }

    const page =
      lens === 'circle'
        ? await fetchCircleFeedPage(client, sources, { limit, offset, sort })
        : await fetchPulseFeedPage(client, sources, { limit, offset, sort });
    return { page, standingSources: sources };
  }

  const fetchRecent = (pageOffset: number, pageLimit: number) =>
    client.query.feed.recent({
      limit: pageLimit,
      offset: pageOffset,
      sort,
    });
  const page =
    options.fillVisible === false
      ? await fetchRecent(offset, limit)
      : await fillVisibleFeedPage({
          offset,
          limit,
          fetchPage: fetchRecent,
          visibleCount: (posts) =>
            countVisibleHomeFeedCards(filterHiddenAuthors(posts)),
        });
  return { page, standingSources: null };
}

async function loadFocusedFeedPage(
  focus: HomeFeedFocus,
  offset: number,
  {
    limit = HOME_FEED_PAGE_SIZE,
    sort = 'recent',
  }: { limit?: number; sort?: HomeFeedSort } = {}
): Promise<Paginated<PostRow>> {
  const client = createReadOnlyOnSocialClient();
  const page =
    focus.kind === 'ticker'
      ? await client.query.feed.byTicker(focus.value, {
          limit,
          offset,
          sort,
        })
      : focus.kind === 'place'
        ? await client.query.feed.byPlace(focus.value, {
            limit,
            offset,
            sort,
          })
        : await client.query.feed.byHashtag(focus.value, {
            limit,
            offset,
            sort,
          });
  // Server orders topic indexes by heat under Hot (chrono while the heat
  // column rolls out). The local epsilon re-sort is idempotent on server
  // order; append paths re-rank the full accumulated list so cross-page
  // order holds.
  if (sort !== 'hot') return page;
  return { ...page, items: sortPostsByHot(page.items) };
}

function HomeFeedLoadMoreFooter({
  loadMoreSentinelRef,
  showSentinel,
  showAppendSkeleton,
}: {
  loadMoreSentinelRef: RefObject<HTMLDivElement | null>;
  showSentinel: boolean;
  showAppendSkeleton: boolean;
}) {
  if (!showSentinel && !showAppendSkeleton) return null;

  return (
    <div className="home-feed-load-more">
      {showSentinel ? (
        <div
          ref={loadMoreSentinelRef}
          className="home-feed-sentinel"
          aria-hidden
        />
      ) : null}
      {showAppendSkeleton ? (
        <PostRowSkeleton rows={2} frames={HOME_FEED_APPEND_SKELETON_FRAMES} />
      ) : null}
    </div>
  );
}

export function HomePagePanel({
  initialPage = null,
  initialEngagement = null,
  initialScarceEmbeds = null,
}: {
  initialPage?: Paginated<PostRow> | null;
  initialEngagement?: Record<string, PostEngagement> | null;
  initialScarceEmbeds?: Record<string, PostScarceEmbed> | null;
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
  const [nextOffset, setNextOffset] = useState<number | undefined>(
    () => restoredSession?.nextOffset ?? initialPage?.nextOffset
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
    null
  );
  const standingSourcesRef = useRef<string[] | null>(
    restoredSession?.standingNetworkIds
      ? [...restoredSession.standingNetworkIds]
      : null
  );
  const nextOffsetRef = useRef<number | undefined>(
    restoredSession?.nextOffset ?? initialPage?.nextOffset
  );
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
  /** Head growth already folded into `nextOffset` by load-more compensation. */
  const offsetShiftAppliedRef = useRef(
    restoredSession?.offsetShiftApplied ?? 0
  );
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
    writeHomeFeedSession({
      sessionKey: feedSessionKeyRef.current,
      posts: postsRef.current,
      nextOffset: nextOffsetRef.current,
      standingNetworkIds: standingSourcesRef.current,
      offsetShiftApplied: offsetShiftAppliedRef.current,
      scrollTop: scrollTopToPersist(memory, line),
      standEpoch: getViewerStandEpoch(),
      blockHeights: feedWindowCacheRef.current?.toJSON(),
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
    offsetShiftAppliedRef.current = snap.offsetShiftApplied;
    feedSessionKeyRef.current = snap.sessionKey;
    scrollMemoryRef.current = createListScrollMemory(snap.scrollTop);
    ssrBootstrapDoneRef.current = true;
    isLoadingRef.current = false;
    setPosts(snap.posts);
    setStandingNetworkIds(
      snap.standingNetworkIds ? [...snap.standingNetworkIds] : null
    );
    setNextOffset(snap.nextOffset);
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
  useLayoutEffect(() => {
    if (!reRankAnchor) return;
    setReRankAnchor(null);
    restoreFeedAnchor(scrollRootRef.current, reRankAnchor);
  }, [posts, reRankAnchor]);

  useEffect(() => {
    const node = scrollRootRef.current;
    if (!(node instanceof HTMLElement)) return;
    const onScroll = (event: Event) => {
      if (!event.isTrusted) return;
      noteHomeFeedSessionScroll(node.scrollTop);
    };
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => node.removeEventListener('scroll', onScroll);
  }, [posts.length]);

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
    void fetchHomeFeedPageClient('global', null, 0, null, 'hot')
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
   * Warm the reply-thread chunk once the feed has painted, so the first
   * Reply opens with the conversation instead of an empty drawer.
   */
  const threadWarmRef = useRef(false);
  useEffect(() => {
    if (threadWarmRef.current || posts.length === 0) return;
    threadWarmRef.current = true;
    const warm = () => {
      void import('@/features/home/live-personal-post-panel');
    };
    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(warm, { timeout: 4000 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timerId = window.setTimeout(warm, 2000);
    return () => window.clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts.length > 0]);

  useListScrollRestore(scrollRootRef, scrollMemoryRef, visiblePosts.length);

  useEffect(() => {
    nextOffsetRef.current = nextOffset;
  }, [nextOffset]);

  useEffect(() => {
    postsLengthRef.current = posts.length;
    postsRef.current = posts;
    seenPostKeysRef.current = feedPostKeySet(posts);
  }, [posts]);

  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  useEffect(() => {
    unseenPostsRef.current = unseenPosts;
  }, [unseenPosts]);

  const clearUnseenPosts = useCallback(() => {
    setUnseenPosts(EMPTY_UNSEEN_FEED_SUMMARY);
  }, []);

  const growFeedWindow = useCallback((insertedCount: number) => {
    if (insertedCount <= 0) return;
    const current = nextOffsetRef.current;
    if (current === undefined) return;
    const next = current + insertedCount;
    nextOffsetRef.current = next;
    setNextOffset(next);
    offsetShiftAppliedRef.current += insertedCount;
  }, []);

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
  const visibleCardCount = useMemo(
    () =>
      countVisibleHomeFeedCards(visiblePosts, {
        includeForeignReplies,
        stoodWithAccountIds,
      }),
    [includeForeignReplies, stoodWithAccountIds, visiblePosts]
  );

  const handleSortChange = useCallback((next: HomeFeedSort) => {
    sortUserChangedRef.current = true;
    setSort(next);
    writeHomeFeedSort(next);
  }, []);

  useEffect(() => {
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
    if (
      restored &&
      restored.posts.length > 0 &&
      restored.sessionKey === sessionKey &&
      reloadNonce === sessionRestoreReloadNonceRef.current &&
      !restoredStandStale
    ) {
      standingSourcesRef.current = restored.standingNetworkIds
        ? [...restored.standingNetworkIds]
        : null;
      setStandingNetworkIds(standingSourcesRef.current);
      feedSessionKeyRef.current = sessionKey;
      setSsrBootstrapDone(true);
      ssrBootstrapDoneRef.current = true;
      isLoadingRef.current = false;
      isRefreshingRef.current = false;
      setIsLoading(false);
      setIsRefreshing(false);
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
      setNextOffset(speculativePage.nextOffset);
      nextOffsetRef.current = speculativePage.nextOffset;
      feedSessionKeyRef.current = HOME_FEED_SSR_SESSION_KEY;
      if (speculativeFeedKeepsPaint(activeLens, sort)) {
        ssrHotGlobalSkipRef.current = true;
        ssrHotGlobalReloadNonceRef.current = reloadNonce;
        setSsrBootstrapDone(true);
        ssrBootstrapDoneRef.current = true;
        isLoadingRef.current = false;
        isRefreshingRef.current = false;
        setIsLoading(false);
        setIsRefreshing(false);
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
      isLoadingRef.current = false;
      isRefreshingRef.current = false;
      setIsLoading(false);
      setIsRefreshing(false);
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
      isRefreshingRef.current = true;
      isLoadingRef.current = false;
      setIsRefreshing(true);
      setIsLoading(false);
    } else {
      standingSourcesRef.current = null;
      setStandingNetworkIds(null);
      isLoadingRef.current = true;
      isRefreshingRef.current = false;
      setIsLoading(true);
      setIsRefreshing(false);
      setNextOffset(undefined);
      nextOffsetRef.current = undefined;
    }
    setIsLoadingMore(false);

    void (async () => {
      try {
        const result = focus
          ? {
              page: await loadFocusedFeedPage(focus, 0, { sort }),
              standingSources: null as string[] | null,
            }
          : await fetchHomeFeedPageClient(activeLens, accountId, 0, null, sort);

        if (!isCurrentLoadingRequest(loadIdRef.current, loadId)) return;

        standingSourcesRef.current = result.standingSources;
        setStandingNetworkIds(result.standingSources);
        const items = result.page.items;
        let insertedCount = 0;
        setPosts((current) => {
          if (mergeHead && current.length > 0) {
            const merged = mergeHomeFeedHead(current, items);
            insertedCount = merged.insertedCount;
            revokeDroppedOptimisticMedia(current, merged.posts);
            return merged.posts;
          }
          revokeDroppedOptimisticMedia(current, items);
          return items;
        });
        feedSessionKeyRef.current = sessionKey;
        if (mergeHead) {
          growFeedWindow(insertedCount);
        } else {
          setNextOffset(result.page.nextOffset);
          nextOffsetRef.current = result.page.nextOffset;
        }
        setSsrBootstrapDone(true);
        ssrBootstrapDoneRef.current = true;
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
        } else {
          setPosts([]);
          setNextOffset(undefined);
          nextOffsetRef.current = undefined;
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
    clearUnseenPosts,
    initialPage,
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
    if (appendInFlightRef.current) return;
    // Never race a full load / soft refresh — a load-more here would bump
    // loadIdRef, cancel the refresh, and append onto a stale list.
    if (isLoadingRef.current || isRefreshingRef.current) return;
    const baseOffset = nextOffsetRef.current;
    if (baseOffset === undefined) return;

    const focus = parseHomeFeedFocus({
      tag: tagParam,
      ticker: tickerParam,
      place: placeParam,
    });

    // Chrono-paged surfaces (any Recent feed) shift when new posts land at
    // the head; compensate so appended pages don't skip rows. Hot pages by
    // heat order everywhere (topic indexes included), where chrono-new posts
    // do not shift offsets.
    const pendingShift = pendingFeedOffsetShift({
      newPostCount: unseenPostsRef.current.count,
      appliedShift: offsetShiftAppliedRef.current,
      // Pulse/Circle cards move when a later reply lifts them. A chrono
      // offset shift then skips the old bottom and jumps to older leftovers.
      chronoPaged: sort !== 'hot' && !isHomeFeedSocialLens(activeLens),
    });
    const offset = baseOffset + pendingShift;

    const loadId = ++loadIdRef.current;
    appendInFlightRef.current = true;
    setIsLoadingMore(true);

    void (async () => {
      try {
        const result = focus
          ? {
              page: await loadFocusedFeedPage(focus, offset, { sort }),
              standingSources: standingSourcesRef.current,
            }
          : await fetchHomeFeedPageClient(
              activeLens,
              accountId,
              offset,
              standingSourcesRef.current,
              sort
            );

        if (!isCurrentLoadingRequest(loadIdRef.current, loadId)) return;

        if (result.standingSources) {
          standingSourcesRef.current = result.standingSources;
          setStandingNetworkIds(result.standingSources);
        }

        if (pendingShift > 0) {
          offsetShiftAppliedRef.current += pendingShift;
        }
        if (focus != null && sort === 'hot') {
          // Focus Hot re-ranks the whole accumulated list on append, so a
          // hot post from a later page can outrank painted rows. Hold the
          // first visible row at its offset — the merge must not shift
          // content under the reader. The layout effect below applies it.
          setReRankAnchor(captureVisibleFeedAnchor(scrollRootRef.current));
        }
        setPosts((current) => {
          const merged = mergeFeedPosts(current, result.page.items);
          return focus != null && sort === 'hot'
            ? sortPostsByHot(merged)
            : merged;
        });
        setNextOffset(result.page.nextOffset);
        nextOffsetRef.current = result.page.nextOffset;
      } catch {
        // Keep the current list; the sentinel stays available to retry.
        if (isCurrentLoadingRequest(loadIdRef.current, loadId)) {
          // Restore offset so the next intersect can retry this page.
          nextOffsetRef.current = baseOffset;
          setNextOffset(baseOffset);
          const painted = countVisibleHomeFeedCards(
            filterHiddenAuthors(postsRef.current),
            {
              includeForeignReplies: homeFeedIncludeForeignReplies(
                activeLens,
                focus != null
              ),
            }
          );
          if (painted === 0) setLoadError('Could not load feed.');
        }
      } finally {
        if (isCurrentLoadingRequest(loadIdRef.current, loadId)) {
          setIsLoadingMore(false);
          appendInFlightRef.current = false;
        }
      }
    })();
  }, [accountId, activeLens, sort, tagParam, tickerParam, placeParam]);

  const hasMore = nextOffset !== undefined;
  const showLoadMoreSentinel = hasMore && visibleCardCount > 0;
  const walkingHiddenPage =
    visibleCardCount === 0 && hasMore && !loadError && !hiddenWalkGaveUp;

  useInfiniteScrollSentinel({
    scrollRootRef,
    sentinelRef: loadMoreRef,
    enabled:
      showLoadMoreSentinel && !isLoading && !isLoadingMore && !isRefreshing,
    onIntersect: loadMore,
    // ~1–1.5 viewports of lead: page two starts fetching well before the
    // append skeleton can scroll into view on cold visits.
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

  const applyNewPosts = useCallback(() => {
    clearUnseenPosts();
    scrollFeedToNewest(scrollRootRef.current);
    setReloadNonce((value) => value + 1);
  }, [clearUnseenPosts]);

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
            page: await loadFocusedFeedPage(focus, 0, {
              limit: HOME_FEED_NEW_PROBE_SIZE,
            }),
          }
        : await fetchHomeFeedPageClient(
            activeLens,
            accountId,
            0,
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
        !isLoadingRef.current &&
        !isRefreshingRef.current &&
        postsLengthRef.current > 0
      ) {
        const reader = createReadOnlyOnSocialClient();
        const freshRows = await reader.query.feed.statesByIds(reconcileTargets);
        if (
          !isLoadingRef.current &&
          !isRefreshingRef.current &&
          postsLengthRef.current > 0
        ) {
          const { next, removedKeys, updatedKeys } = reconcileFeedRows(
            postsRef.current,
            freshRows,
            reconcileTargets
          );
          // The posts-effect sync resyncs postsRef/length/seen keys.
          if (removedKeys.length > 0 || updatedKeys.length > 0) {
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
      scrollFeedToNewest(scrollRootRef.current);
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
  const showAppendSkeleton = loadingPresentation === 'append-skeleton';
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
              scroll={false}
            >
              <OnSocialMark className="home-feed-discover-mark" aria-hidden />
              Discover
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

          {showColdSkeleton ? (
            <PostRowSkeleton rows={4} frames={HOME_FEED_COLD_SKELETON_FRAMES} />
          ) : null}

          {showEmpty ? (
            <div className="home-feed-state">{emptyCopy}</div>
          ) : null}

          {showFeed ? (
            <>
              <PersonalFeedList
                posts={visiblePosts}
                includeForeignReplies={includeForeignReplies}
                stoodWithAccountIds={stoodWithAccountIds}
                showGuildAttribution
                className={`home-feed-list${isRefreshing ? ' is-refreshing' : ''}`}
                initialEngagement={initialEngagement}
                initialScarceEmbeds={initialScarceEmbeds}
                windowSizeCache={feedWindowCacheRef.current}
                pinnedFeedKey={reRankAnchor?.key ?? null}
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
                showAppendSkeleton={showAppendSkeleton}
              />
            </>
          ) : null}

          {sheet}
        </OsAppChromePage>

        <HomeFeedPullIndicator subscribe={pullRefresh.subscribe} />

        {showNewPostsPill ? (
          <HomeFeedNewPostsChip
            summary={unseenPosts}
            hidden={toolbarHidden}
            onClick={applyNewPosts}
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

/** @deprecated Prefer {@link HomePagePanel}. */
export const HomeFeedPanel = HomePagePanel;
