'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  postContentPath,
  type Paginated,
  type PostRow,
  type PostScarceEmbed,
} from '@onsocial/sdk';
import { OnSocialMark, ProtocolMotionArrow } from '@onsocial/ui';
import type { PostEngagement } from '@/hooks/use-post-engagement';
import { ListLoadError } from '@/components/panels/list-load-error';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { HomeFeedChipBar } from '@/features/home/home-feed-chip-bar';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';
import { HomeFeedSortToggle } from '@/features/home/home-feed-sort-toggle';
import { APP_DISCOVER_PATH } from '@/lib/app-routes';
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
  shouldPrependOptimisticFeedPost,
} from '@/features/home/personal-feed-list';
import { PostRowSkeleton, postKey } from '@/features/home/post-card';
import { usePersonalComposer } from '@/features/home/use-personal-composer';
import { subscribePersonalPostConfirmed } from '@/features/scarces/drop-compose-host';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import {
  applyOptimisticAmplifyHeat,
  mergeAmplifyHeatFloors,
  optimisticAmplifyHeatDelta,
  sortPostsByHot,
  type AmplifyHeatFloor,
  type AmplifySuccessDetail,
} from '@/lib/amplify-heat';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { fetchIndexedPostsByRefs } from '@/lib/fetch-personal-post';
import { parseSaveContentPath } from '@/lib/save-content-path';
import {
  countUnseenFeedPosts,
  feedPostKeySet,
  HOME_FEED_NEW_POLL_MS,
  HOME_FEED_NEW_PROBE_SIZE,
  homeFeedNewPostsLabel,
  pendingFeedOffsetShift,
} from '@/lib/home-feed-new-posts';
import { revokeDroppedOptimisticMedia } from '@/lib/post-media';
import { filterHiddenAuthors } from '@/lib/viewer-mute-block-filter';
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
  const saves = await client.query.saves.list(accountId, { limit, offset });
  const refs = saves
    .map((row) => parseSaveContentPath(row.contentPath))
    .filter((ref): ref is { author: string; postId: string } => ref != null);
  const byRef = await fetchIndexedPostsByRefs(refs);
  const items: PostRow[] = [];
  for (const ref of refs) {
    const row = byRef.get(`${ref.author}\0${ref.postId}`);
    if (row) items.push(row);
  }
  return {
    items,
    nextOffset: saves.length < limit ? undefined : offset + saves.length,
  };
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
  const standing = await client.query.standings.outgoing(accountId, {
    limit: 48,
  });
  return Array.from(new Set([accountId, ...standing]));
}

async function fetchHomeFeedPageClient(
  lens: HomeFeedLens,
  accountId: string | null,
  offset: number,
  standingSources: string[] | null,
  sort: HomeFeedSort,
  limit: number = HOME_FEED_PAGE_SIZE
): Promise<{ page: Paginated<PostRow>; standingSources: string[] | null }> {
  const client = createReadOnlyOnSocialClient();

  if (lens === 'saved' && accountId) {
    const page = await fetchSavedFeedPage(accountId, offset, limit);
    return { page, standingSources: null };
  }

  if (lens === 'standing' && accountId) {
    const sources =
      standingSources ?? (await resolveStandingSources(accountId));

    if (sources.length === 0) {
      return { page: { items: [] }, standingSources: sources };
    }

    const page = await client.query.feed.fromAccounts({
      accounts: sources,
      limit,
      offset,
      sort,
    });
    return { page, standingSources: sources };
  }

  const page = await client.query.feed.recent({
    limit,
    offset,
    sort,
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
  // order and keeps optimistic floors coherent; append paths re-rank the
  // full accumulated list so cross-page order holds.
  if (sort !== 'hot') return page;
  return { ...page, items: sortPostsByHot(page.items) };
}

function HomeFeedLoadMoreFooter({
  loadMoreSentinelRef,
  showSentinel,
  isLoadingMore,
}: {
  loadMoreSentinelRef: RefObject<HTMLDivElement | null>;
  showSentinel: boolean;
  isLoadingMore: boolean;
}) {
  if (!showSentinel && !isLoadingMore) return null;

  return (
    <div className="home-feed-load-more">
      {showSentinel ? (
        <div
          ref={loadMoreSentinelRef}
          className="home-feed-sentinel"
          aria-hidden
        />
      ) : null}
      {isLoadingMore ? <PostRowSkeleton rows={2} /> : null}
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
  const [posts, setPosts] = useState<PostRow[]>(() => initialPage?.items ?? []);
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
    () => initialPage?.nextOffset
  );
  const [isLoading, setIsLoading] = useState(() => initialPage == null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [engagementError, setEngagementError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [newPostCount, setNewPostCount] = useState(0);
  const [lens, setLens] = useState<HomeFeedLens>('global');
  const [lensReady, setLensReady] = useState(false);
  const [sort, setSort] = useState<HomeFeedSort>('hot');
  const [ssrBootstrapDone, setSsrBootstrapDone] = useState(
    () => initialPage != null
  );
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
  const standingSourcesRef = useRef<string[] | null>(null);
  const nextOffsetRef = useRef<number | undefined>(initialPage?.nextOffset);
  const postsLengthRef = useRef(initialPage?.items.length ?? 0);
  const amplifyReconcileTimerRef = useRef<number | null>(null);
  const amplifyHeatFloorsRef = useRef<Map<string, AmplifyHeatFloor>>(new Map());
  const seenPostKeysRef = useRef<Set<string>>(new Set());
  const newPostsProbeInFlightRef = useRef(false);
  const newPostCountRef = useRef(0);
  /** Head growth already folded into `nextOffset` by load-more compensation. */
  const offsetShiftAppliedRef = useRef(0);
  const isRefreshingRef = useRef(false);
  const isLoadingRef = useRef(initialPage == null);
  const ssrBootstrapDoneRef = useRef(initialPage != null);
  /** Skip duplicate global/hot fetch after SSR seed; cleared on lens/sort/focus. */
  const ssrHotGlobalSkipRef = useRef(initialPage != null);
  const ssrHotGlobalReloadNonceRef = useRef(0);

  useEffect(() => {
    nextOffsetRef.current = nextOffset;
  }, [nextOffset]);

  useEffect(() => {
    postsLengthRef.current = posts.length;
    seenPostKeysRef.current = feedPostKeySet(posts);
  }, [posts]);

  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  useEffect(() => {
    newPostCountRef.current = newPostCount;
  }, [newPostCount]);

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
    setSort(storedSort);
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

  const handleSortChange = useCallback((next: HomeFeedSort) => {
    setSort(next);
    writeHomeFeedSort(next);
  }, []);

  const clearAmplifyReconcileTimer = useCallback(() => {
    if (amplifyReconcileTimerRef.current != null) {
      window.clearTimeout(amplifyReconcileTimerRef.current);
      amplifyReconcileTimerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => clearAmplifyReconcileTimer(),
    [clearAmplifyReconcileTimer]
  );

  /**
   * Hot: optimistic heat bump + in-memory re-sort for instant lift, then one
   * soft reconcile refetch so indexer heat can replace the estimate.
   * Focus feeds re-rank client-side, so the lift applies there too.
   */
  const handleAmplified = useCallback(
    (post: PostRow, detail: AmplifySuccessDetail) => {
      if (sort !== 'hot') return;

      const key = postKey(post);
      const delta = optimisticAmplifyHeatDelta(detail);
      setPosts((current) => {
        const row = current.find((item) => postKey(item) === key);
        const nextHeat = (row?.amplifyHeat ?? post.amplifyHeat ?? 0) + delta;
        if (delta > 0) {
          amplifyHeatFloorsRef.current.set(key, {
            heat: nextHeat,
            untilMs: Date.now() + 15_000,
          });
        }
        return applyOptimisticAmplifyHeat(current, post, detail);
      });

      clearAmplifyReconcileTimer();
      amplifyReconcileTimerRef.current = window.setTimeout(() => {
        amplifyReconcileTimerRef.current = null;
        setReloadNonce((value) => value + 1);
      }, 2_500);
    },
    [clearAmplifyReconcileTimer, sort]
  );

  useEffect(() => {
    const focus = parseHomeFeedFocus({ tag: tagParam, ticker: tickerParam, place: placeParam });

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
      setIsLoading(false);
      // Assume SSR hot matches until standing lens needs a client upgrade.
      ssrHotGlobalSkipRef.current = true;
      ssrHotGlobalReloadNonceRef.current = reloadNonce;
      // Soft-upgrade standing once wallet + lens are ready.
      if (walletLoading || !lensReady) return;
      if (activeLens !== 'standing' || !accountId) return;
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

    if (walletLoading || !lensReady) {
      return;
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
    standingSourcesRef.current = null;
    setEngagementError(null);
    setLoadError(null);
    setNewPostCount(0);
    newPostCountRef.current = 0;
    offsetShiftAppliedRef.current = 0;

    const keepPrevious = postsLengthRef.current > 0;
    if (keepPrevious) {
      setIsRefreshing(true);
      setIsLoading(false);
    } else {
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

        if (loadIdRef.current !== loadId) return;

        standingSourcesRef.current = result.standingSources;
        const items = result.page.items;
        // Drop expired optimistic floors so the map does not grow unbounded.
        const nowMs = Date.now();
        for (const [key, floor] of amplifyHeatFloorsRef.current) {
          if (floor.untilMs <= nowMs) amplifyHeatFloorsRef.current.delete(key);
        }
        setPosts((current) => {
          revokeDroppedOptimisticMedia(current, items);
          const ranked =
            sort === 'hot'
              ? mergeAmplifyHeatFloors(items, amplifyHeatFloorsRef.current)
              : items;
          return ranked;
        });
        setNextOffset(result.page.nextOffset);
        nextOffsetRef.current = result.page.nextOffset;
        setSsrBootstrapDone(true);
        ssrBootstrapDoneRef.current = true;
      } catch (cause) {
        if (loadIdRef.current !== loadId) return;
        const message =
          cause instanceof Error ? cause.message : 'Could not load feed.';
        setLoadError(message);
        if (keepPrevious) {
          standingSourcesRef.current = previousStandingSources;
          setNextOffset(previousNextOffset);
          nextOffsetRef.current = previousNextOffset;
        } else {
          setPosts([]);
          setNextOffset(undefined);
          nextOffsetRef.current = undefined;
        }
      } finally {
        if (loadIdRef.current === loadId) {
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
    initialPage,
    lensReady,
    reloadNonce,
    sort,
    tagParam,
    tickerParam,
    placeParam,
    walletLoading,
  ]);

  const loadMore = useCallback(() => {
    if (appendInFlightRef.current) return;
    // Never race a full load / soft refresh — a load-more here would bump
    // loadIdRef, cancel the refresh, and append onto a stale list.
    if (isLoadingRef.current || isRefreshingRef.current) return;
    const baseOffset = nextOffsetRef.current;
    if (baseOffset === undefined) return;

    const focus = parseHomeFeedFocus({ tag: tagParam, ticker: tickerParam, place: placeParam });

    // Chrono-paged surfaces (any Recent feed) shift when new posts land at
    // the head; compensate so appended pages don't skip rows. Hot pages by
    // heat order everywhere (topic indexes included), where chrono-new posts
    // do not shift offsets.
    const pendingShift = pendingFeedOffsetShift({
      newPostCount: newPostCountRef.current,
      appliedShift: offsetShiftAppliedRef.current,
      chronoPaged: sort !== 'hot',
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

        if (loadIdRef.current !== loadId) return;

        if (result.standingSources) {
          standingSourcesRef.current = result.standingSources;
        }

        if (pendingShift > 0) {
          offsetShiftAppliedRef.current += pendingShift;
        }
        setPosts((current) => {
          const merged = mergeFeedPosts(current, result.page.items);
          // Focus Hot pages arrive chrono; re-rank the whole list so a hot
          // post from a later page can outrank cold rows from earlier pages.
          return focus != null && sort === 'hot'
            ? sortPostsByHot(merged)
            : merged;
        });
        setNextOffset(result.page.nextOffset);
        nextOffsetRef.current = result.page.nextOffset;
      } catch {
        // Keep the current list; the sentinel stays available to retry.
        if (loadIdRef.current === loadId) {
          // Restore offset so the next intersect can retry this page.
          nextOffsetRef.current = baseOffset;
          setNextOffset(baseOffset);
        }
      } finally {
        if (loadIdRef.current === loadId) {
          setIsLoadingMore(false);
          appendInFlightRef.current = false;
        }
      }
    })();
  }, [accountId, activeLens, sort, tagParam, tickerParam, placeParam]);

  const hasMore = nextOffset !== undefined;
  const showLoadMoreSentinel = hasMore && visiblePosts.length > 0;

  useInfiniteScrollSentinel({
    scrollRootRef,
    sentinelRef: loadMoreRef,
    enabled:
      showLoadMoreSentinel && !isLoading && !isLoadingMore && !isRefreshing,
    onIntersect: loadMore,
    rootMargin: '200px 0px',
  });

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
    setNewPostCount(0);
    scrollRootRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setReloadNonce((value) => value + 1);
  }, []);

  const probeNewPosts = useCallback(async () => {
    if (
      !lensReady ||
      walletLoading ||
      activeLens === 'saved' ||
      isLoadingRef.current ||
      isRefreshingRef.current ||
      newPostsProbeInFlightRef.current ||
      postsLengthRef.current === 0 ||
      (typeof document !== 'undefined' && document.visibilityState === 'hidden')
    ) {
      return;
    }

    newPostsProbeInFlightRef.current = true;
    const focus = parseHomeFeedFocus({ tag: tagParam, ticker: tickerParam, place: placeParam });

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
            HOME_FEED_NEW_PROBE_SIZE
          );

      if (
        isLoadingRef.current ||
        isRefreshingRef.current ||
        postsLengthRef.current === 0
      ) {
        return;
      }

      const unseen = countUnseenFeedPosts(
        result.page.items,
        seenPostKeysRef.current
      );
      setNewPostCount(unseen);
    } catch {
      // Quiet — pill is best-effort; list stays as-is.
    } finally {
      newPostsProbeInFlightRef.current = false;
    }
  }, [accountId, activeLens, lensReady, tagParam, tickerParam, placeParam, walletLoading]);

  useEffect(() => {
    if (!lensReady || walletLoading) return;

    const tick = () => {
      void probeNewPosts();
    };

    const warmupId = window.setTimeout(tick, 12_000);
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

  const onConfirmed = useCallback((post: PostRow) => {
    if (!shouldPrependOptimisticFeedPost(post)) return;
    setPosts((current) => {
      const key = postKey(post);
      if (current.some((row) => postKey(row) === key)) return current;
      return [post, ...current];
    });
  }, []);

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

  const { openReply, openQuote, openRepost, openUndoRepost, sheet } =
    usePersonalComposer({
    registerPen: Boolean(isConnected && accountId),
    destinationLabel,
    onConfirmed,
    onUnreposted,
  });

  const replyHandler = isConnected ? openReply : undefined;
  const quoteHandler = isConnected ? openQuote : undefined;
  const repostHandler = isConnected ? openRepost : undefined;
  const undoRepostHandler = isConnected ? openUndoRepost : undefined;

  const emptyCopy = activeFocus
    ? homeFeedFocusEmptyCopy(activeFocus)
    : homeFeedLensEmptyCopy(activeLens);

  const showColdSkeleton = isLoading && visiblePosts.length === 0;
  const showEmpty =
    !isLoading && !isRefreshing && !loadError && visiblePosts.length === 0;
  const showFeed = visiblePosts.length > 0;
  const newPostsLabel = homeFeedNewPostsLabel(newPostCount);
  const showNewPostsPill =
    Boolean(newPostsLabel) && showFeed && !isRefreshing && !isLoading;
  const toolbarHidden = useDockAutoHide(false, scrollRootRef);

  return (
    <HomeActiveFocusProvider focus={activeFocus}>
      <OsAppScreen
        title="Home"
        glassChrome
        scrollRootRef={scrollRootRef}
        leading={
          <Link
            href={APP_DISCOVER_PATH}
            className="home-feed-discover-link"
            scroll={false}
          >
            <OnSocialMark className="home-feed-discover-mark" aria-hidden />
            Discover
          </Link>
        }
        heading={<span className="home-feed-nav-empty" aria-hidden />}
        actions={
          activeLens === 'saved' ? null : (
            <HomeFeedSortToggle sort={sort} onSortChange={handleSortChange} />
          )
        }
        toolbar={
          <div
            className={`os-app-chrome-rail home-feed-header-toolbar${
              toolbarHidden ? ' is-scroll-hidden' : ''
            }`}
          >
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
          </div>
        }
      >
        <div className="home-feed">
          {!isConnected && !walletLoading ? (
            <section className="post-composer post-composer-guest">
              <p className="post-composer-lead">Connect your wallet to post.</p>
            </section>
          ) : null}

          {loadError ? (
            <ListLoadError message={loadError} onRetry={retryLoad} />
          ) : null}

          {engagementError ? (
            <p className="standing-panel-error" role="alert">
              {engagementError}
            </p>
          ) : null}

          {showColdSkeleton ? <PostRowSkeleton rows={4} /> : null}

          {showEmpty ? (
            <div className="home-feed-state">{emptyCopy}</div>
          ) : null}

          {showFeed ? (
            <>
              <PersonalFeedList
                posts={visiblePosts}
                includeForeignReplies={Boolean(activeFocus)}
                showGuildAttribution
                className={`home-feed-list${isRefreshing ? ' is-refreshing' : ''}`}
                initialEngagement={initialEngagement}
                initialScarceEmbeds={initialScarceEmbeds}
                onReply={replyHandler}
                onQuote={quoteHandler}
                onRepost={repostHandler}
                onUndoRepost={undoRepostHandler}
                onAmplified={handleAmplified}
                onEngagementError={(message) => setEngagementError(message)}
              />
              <HomeFeedLoadMoreFooter
                loadMoreSentinelRef={loadMoreRef}
                showSentinel={showLoadMoreSentinel}
                isLoadingMore={isLoadingMore}
              />
            </>
          ) : null}

          {sheet}
        </div>
      </OsAppScreen>

      {showNewPostsPill ? (
        <div className="home-feed-new-posts-anchor" role="status">
          <button
            type="button"
            className="home-feed-new-posts-pill"
            onClick={applyNewPosts}
          >
            <ProtocolMotionArrow
              static
              className="home-feed-new-posts-pill-arrow"
            />
            <span>{newPostsLabel}</span>
          </button>
        </div>
      ) : null}

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
