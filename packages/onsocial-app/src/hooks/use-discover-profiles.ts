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
import { usePathname, useSearchParams } from 'next/navigation';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import { useViewerEndorsement } from '@/hooks/use-viewer-endorsement';
import { useViewerStanding } from '@/hooks/use-viewer-standing';
import {
  getGlobalViewerBlockLedgerVersion,
  subscribeGlobalViewerBlockLedger,
} from '@/lib/viewer-block-global';
import {
  getGlobalViewerMuteLedgerVersion,
  subscribeGlobalViewerMuteLedger,
} from '@/lib/viewer-mute-global';
import { filterHiddenAuthors } from '@/lib/viewer-mute-block-filter';
import { buildDiscoverEmptyState } from '@/lib/discover-empty-state';
import {
  discoverPeopleSearchQuery,
  isDiscoverPeopleSearchActive,
} from '@/features/discover/discover-omni-search';
import {
  applyDiscoverTabParam,
  discoverTabForQueryDraft,
  discoverTopicFilterPrefix,
  DISCOVER_TAB_QUERY_KEY,
  isDiscoverProfilesTab,
  parseDiscoverTab,
  type DiscoverTab,
} from '@/features/discover/discover-tabs';
import {
  buildDiscoverListSummary,
  formatDiscoverSubtitle,
} from '@/lib/discover-list-summary';
import {
  readDiscoverTabScroll,
  readElementScrollTop,
  rememberDiscoverTabScroll,
  scheduleDiscoverTabScrollRestore,
  type DiscoverTabScrollMap,
} from '@/lib/discover-tab-scroll';
import type { DiscoverFaceFilter } from '@onsocial/sdk';
import {
  applyDiscoverFilterParams,
  discoverProfileToProfileListAccount,
  fetchDiscoverProfiles,
  parseDiscoverProfileFilters,
  type DiscoverProfileSummary,
  type DiscoverProfilesResponse,
} from '@/lib/discover-profiles';
import {
  profileListAccountToStandingSummary,
  type ProfileListAccount,
} from '@/lib/profile-list-account';
import { normalizeProfileSearchQuery } from '@/lib/profile-account-search';
import { isDiscoverListCacheDisplayReady } from '@/lib/profile-list-display';
import {
  discoverListCacheKey,
  readDiscoverListCache,
  writeDiscoverListCache,
} from '@/lib/discover-list-cache';
import { replaceBrowserQueryUrl } from '@/lib/sync-browser-url-query';
import { overlayViewerEndorsedOnAccounts } from '@/lib/viewer-endorsement-ledger';
import { getGlobalViewerEndorsementLedger } from '@/lib/viewer-endorsement-global';

function discoverUrlQueryValue(query: string, tab: DiscoverTab): string {
  if (
    tab === 'profiles' ||
    tab === 'trending' ||
    tab === 'daos' ||
    tab === 'guilds' ||
    tab === 'hubs'
  ) {
    return discoverPeopleSearchQuery(query);
  }
  return discoverTopicFilterPrefix(query, tab);
}

function restoreDiscoverQueryFromUrl(
  tab: DiscoverTab,
  rawQ: string | null
): string {
  const q = normalizeProfileSearchQuery(rawQ);
  if (!q) return '';
  if (tab === 'topics') return `#${q}`;
  if (tab === 'tickers') return `$${q}`;
  return q;
}

interface ProtocolPulseTotals {
  discoverableProfiles?: number;
  profiles?: number;
}

interface ProtocolPulseResponse {
  totals?: ProtocolPulseTotals;
}

function mergeDiscoverProfiles(
  current: DiscoverProfileSummary[],
  incoming: DiscoverProfileSummary[]
): DiscoverProfileSummary[] {
  if (incoming.length === 0) return current;

  const seen = new Set(current.map((profile) => profile.accountId));
  const merged = [...current];

  for (const profile of incoming) {
    if (seen.has(profile.accountId)) continue;
    seen.add(profile.accountId);
    merged.push(profile);
  }

  return merged;
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError';
}

interface UseDiscoverProfilesOptions {
  initialPage?: DiscoverProfilesResponse | null;
}

export function useDiscoverProfiles(
  scrollRootRef?: RefObject<Element | null>,
  options: UseDiscoverProfilesOptions = {}
) {
  const initialPage = options.initialPage ?? null;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    accountId: viewerAccountId,
    isConnected,
    isLoading: walletLoading,
    connect,
  } = useAppWallet();
  const { updateStanding, isStandingPendingForTarget, standingSyncVersion } =
    useViewerStanding('discover');
  const { endorsementSyncVersion } = useViewerEndorsement('discover');
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

  const [query, setQueryState] = useState(() =>
    restoreDiscoverQueryFromUrl(
      parseDiscoverTab(searchParams.get(DISCOVER_TAB_QUERY_KEY)),
      searchParams.get('q')
    )
  );
  const [tab, setTabState] = useState<DiscoverTab>(() => {
    const parsed = parseDiscoverTab(searchParams.get(DISCOVER_TAB_QUERY_KEY));
    const urlQuery = restoreDiscoverQueryFromUrl(parsed, searchParams.get('q'));
    return discoverTabForQueryDraft(urlQuery, parsed);
  });
  const [face, setFaceState] = useState<DiscoverFaceFilter>(
    () =>
      parseDiscoverProfileFilters({
        face: searchParams.get('face'),
        industry: searchParams.get('industry'),
      }).face ?? 'all'
  );
  const [industry, setIndustryState] = useState(
    () =>
      parseDiscoverProfileFilters({
        face: searchParams.get('face'),
        industry: searchParams.get('industry'),
      }).industry ?? ''
  );
  const [profiles, setProfiles] = useState<DiscoverProfileSummary[]>(
    () => initialPage?.profiles ?? []
  );
  const [pendingStandingIds, setPendingStandingIds] = useState<Set<string>>(
    () => new Set()
  );
  const [hasMore, setHasMore] = useState(() => initialPage?.hasMore ?? false);
  const [isLoading, setIsLoading] = useState(() => initialPage == null);
  const [isListRefreshing, setIsListRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [protocolPulseTotals, setProtocolPulseTotals] =
    useState<ProtocolPulseTotals | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [relationshipSynced, setRelationshipSynced] = useState(false);
  const viewerKey = viewerAccountId ?? null;

  const loadIdRef = useRef(0);
  const appendInFlightRef = useRef(false);
  const pageAbortRef = useRef<AbortController | null>(null);
  const appendAbortRef = useRef<AbortController | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const normalizedQuery = discoverPeopleSearchQuery(query);
  const topicFilterPrefix = discoverTopicFilterPrefix(query, tab);
  const urlQueryValue = discoverUrlQueryValue(query, tab);

  const tabScrollRef = useRef<DiscoverTabScrollMap>({});
  const setTab = useCallback(
    (next: DiscoverTab) => {
      setTabState((current) => {
        if (current === next) return current;
        tabScrollRef.current = rememberDiscoverTabScroll(
          tabScrollRef.current,
          current,
          readElementScrollTop(scrollRootRef?.current)
        );
        return next;
      });
    },
    [scrollRootRef]
  );

  useLayoutEffect(() => {
    return scheduleDiscoverTabScrollRestore(
      scrollRootRef?.current,
      readDiscoverTabScroll(tabScrollRef.current, tab)
    );
  }, [scrollRootRef, tab]);

  useEffect(() => {
    tabScrollRef.current = {};
  }, [face, industry, normalizedQuery]);

  const setFace = useCallback((next: DiscoverFaceFilter) => {
    setFaceState(next);
    if (next === 'people') {
      setIndustryState('');
    }
  }, []);

  const setIndustry = useCallback((next: string) => {
    setIndustryState(next.trim());
  }, []);

  const setQuery = useCallback((value: string) => {
    setQueryState(value);
    setTabState((current) => discoverTabForQueryDraft(value, current));
  }, []);

  const mergedPendingStandingIds = useMemo(() => {
    void standingSyncVersion;
    const merged = new Set(pendingStandingIds);
    for (const profile of profiles) {
      if (isStandingPendingForTarget(profile.accountId)) {
        merged.add(profile.accountId);
      }
    }
    return merged;
  }, [
    pendingStandingIds,
    profiles,
    isStandingPendingForTarget,
    standingSyncVersion,
  ]);

  const isStandingPending = useCallback(
    (targetAccountId: string) => mergedPendingStandingIds.has(targetAccountId),
    [mergedPendingStandingIds]
  );

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/graph/protocol-pulse', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: ProtocolPulseResponse | null) => {
        const totals = data?.totals;
        if (!totals) return;

        const discoverable = totals.discoverableProfiles ?? totals.profiles;
        const indexed = totals.profiles;
        if (
          (typeof discoverable === 'number' && discoverable > 0) ||
          (typeof indexed === 'number' && indexed > 0)
        ) {
          setProtocolPulseTotals({
            discoverableProfiles: discoverable,
            profiles: indexed,
          });
        }
      })
      .catch(() => {
        // Discover still works without graph-wide totals.
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (urlQueryValue) {
      params.set('q', urlQueryValue);
    } else {
      params.delete('q');
    }
    applyDiscoverTabParam(params, tab);
    applyDiscoverFilterParams(params, face, industry);

    replaceBrowserQueryUrl(pathname, params);
  }, [face, industry, pathname, tab, urlQueryValue]);

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const nextTab = parseDiscoverTab(params.get(DISCOVER_TAB_QUERY_KEY));
      setTabState(nextTab);
      setQueryState(restoreDiscoverQueryFromUrl(nextTab, params.get('q')));
      const restored = parseDiscoverProfileFilters({
        face: params.get('face'),
        industry: params.get('industry'),
      });
      setFaceState(restored.face ?? 'all');
      setIndustryState(restored.industry ?? '');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const loadPage = useCallback(
    async (
      offset: number,
      append: boolean,
      loadOptions?: { background?: boolean }
    ) => {
      if (append && appendInFlightRef.current) return;

      const loadId = ++loadIdRef.current;
      const abortRef = append ? appendAbortRef : pageAbortRef;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (append) {
        appendInFlightRef.current = true;
        setIsLoadingMore(true);
      } else {
        appendInFlightRef.current = false;
        if (loadOptions?.background) {
          setIsListRefreshing(true);
        } else {
          setIsLoading(true);
          setLoadError(null);
          setRelationshipSynced(false);
        }
      }

      try {
        const response = await fetchDiscoverProfiles(
          normalizedQuery,
          viewerKey,
          offset,
          controller.signal,
          { face, industry }
        );
        if (loadIdRef.current !== loadId) return;

        setProfiles((current) => {
          const merged = append
            ? mergeDiscoverProfiles(current, response.profiles)
            : response.profiles;
          writeDiscoverListCache(
            discoverListCacheKey(normalizedQuery, viewerKey, face, industry),
            {
              viewerAccountId: viewerKey,
              profiles: merged,
              hasMore: response.hasMore,
            }
          );
          return merged;
        });
        setHasMore(response.hasMore);
      } catch (cause) {
        if (loadIdRef.current !== loadId || isAbortError(cause)) return;
        const message =
          cause instanceof Error ? cause.message : 'Could not load profiles.';
        if (!loadOptions?.background) {
          setLoadError(message);
          if (!append) {
            setProfiles([]);
            setHasMore(false);
          }
        }
      } finally {
        if (loadIdRef.current === loadId) {
          setIsLoading(false);
          setIsLoadingMore(false);
          setIsListRefreshing(false);
          setRelationshipSynced(true);
        }
        if (append && loadIdRef.current === loadId) {
          appendInFlightRef.current = false;
        }
      }
    },
    [face, industry, normalizedQuery, viewerAccountId, viewerKey]
  );

  useEffect(() => {
    if (walletLoading) {
      return;
    }

    if (!isDiscoverProfilesTab(tab)) {
      pageAbortRef.current?.abort();
      setIsLoading(false);
      setIsListRefreshing(false);
      setIsLoadingMore(false);
      return;
    }

    const loadId = ++loadIdRef.current;
    pageAbortRef.current?.abort();
    const controller = new AbortController();
    pageAbortRef.current = controller;

    const cacheKey = discoverListCacheKey(
      normalizedQuery,
      viewerKey,
      face,
      industry
    );
    const canUseInitialPage =
      initialPage != null &&
      normalizedQuery === normalizeProfileSearchQuery(initialPage.query) &&
      (initialPage.face ?? 'all') === face &&
      (initialPage.industry ?? '') === industry;
    const bootstrap = canUseInitialPage
      ? {
          viewerAccountId: null,
          profiles: initialPage.profiles,
          hasMore: initialPage.hasMore,
        }
      : undefined;
    const cachedEntry = readDiscoverListCache(cacheKey) ?? bootstrap;
    const cacheReady =
      cachedEntry != null &&
      isDiscoverListCacheDisplayReady(cachedEntry, viewerKey);

    if (cachedEntry && cacheReady) {
      setProfiles(cachedEntry.profiles);
      setHasMore(cachedEntry.hasMore);
      setIsLoading(false);
      setIsListRefreshing(true);
      setLoadError(null);
      setRelationshipSynced(true);
      writeDiscoverListCache(cacheKey, cachedEntry);
    } else if (canUseInitialPage) {
      setProfiles(initialPage.profiles);
      setHasMore(initialPage.hasMore);
      setIsLoading(false);
      setIsListRefreshing(true);
      setLoadError(null);
      setRelationshipSynced(false);
    } else {
      setProfiles([]);
      setHasMore(false);
      setIsLoading(true);
      setIsListRefreshing(false);
      setLoadError(null);
      setRelationshipSynced(false);
    }

    const fetchDelay =
      cacheReady || canUseInitialPage ? 0 : normalizedQuery.trim() ? 220 : 250;

    const handle = window.setTimeout(() => {
      void fetchDiscoverProfiles(
        normalizedQuery,
        viewerKey,
        0,
        controller.signal,
        { face, industry }
      )
        .then((response) => {
          if (loadIdRef.current !== loadId) return;
          setProfiles(response.profiles);
          setHasMore(response.hasMore);
          writeDiscoverListCache(cacheKey, {
            viewerAccountId: viewerKey,
            profiles: response.profiles,
            hasMore: response.hasMore,
          });
        })
        .catch((cause) => {
          if (loadIdRef.current !== loadId || isAbortError(cause)) return;
          const message =
            cause instanceof Error ? cause.message : 'Could not load profiles.';
          if (!cacheReady && !canUseInitialPage) {
            setLoadError(message);
            setProfiles([]);
            setHasMore(false);
          }
        })
        .finally(() => {
          if (loadIdRef.current === loadId) {
            setIsLoading(false);
            setIsListRefreshing(false);
            setRelationshipSynced(true);
          }
        });
    }, fetchDelay);

    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
  }, [
    face,
    industry,
    initialPage,
    normalizedQuery,
    reloadNonce,
    tab,
    viewerKey,
    walletLoading,
  ]);

  const showLoadMoreSentinel = hasMore && profiles.length > 0;

  const handleLoadMore = useCallback(() => {
    if (appendInFlightRef.current) return;
    void loadPage(profiles.length, true);
  }, [loadPage, profiles.length]);

  useInfiniteScrollSentinel({
    scrollRootRef,
    sentinelRef: loadMoreRef,
    enabled: showLoadMoreSentinel && !isLoading && !isLoadingMore,
    onIntersect: handleLoadMore,
    rootMargin: '160px 0px',
  });

  const discoverableTotal =
    protocolPulseTotals?.discoverableProfiles ??
    protocolPulseTotals?.profiles ??
    null;
  const indexedProfileTotal = protocolPulseTotals?.profiles ?? null;

  const listAccounts = useMemo(
    () =>
      overlayViewerEndorsedOnAccounts(
        filterHiddenAuthors(profiles).map(discoverProfileToProfileListAccount),
        getGlobalViewerEndorsementLedger()
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profiles, muteBlockSyncVersion, endorsementSyncVersion]
  );

  const footerSummary = useMemo(() => {
    if (isLoading && profiles.length === 0) return null;

    return buildDiscoverListSummary({
      shownCount: profiles.length,
      hasMore,
      query,
      face,
      discoverableTotal,
      indexedProfileTotal,
    });
  }, [
    discoverableTotal,
    face,
    hasMore,
    indexedProfileTotal,
    isLoading,
    profiles.length,
    query,
  ]);

  const subtitle = useMemo(
    () => formatDiscoverSubtitle(discoverableTotal),
    [discoverableTotal]
  );

  const emptyState = useMemo(
    () => buildDiscoverEmptyState(query, face, industry),
    [face, industry, query]
  );

  const listBootstrapReady = useMemo(
    () =>
      initialPage != null &&
      normalizedQuery === normalizeProfileSearchQuery(initialPage.query) &&
      (initialPage.face ?? 'all') === face &&
      (initialPage.industry ?? '') === industry,
    [face, industry, initialPage, normalizedQuery]
  );
  const hasListRows = profiles.length > 0;

  const showConnectHint = !walletLoading && !isConnected;
  const searching = isDiscoverPeopleSearchActive(query);
  const searchSettled = !searching || !isLoading;
  const showListSkeleton =
    !searching &&
    (walletLoading ||
      (!listBootstrapReady && isLoading && !hasListRows) ||
      (!listBootstrapReady && !relationshipSynced && !hasListRows));
  const isSearchEmpty = searching;
  const listKey = `${normalizedQuery || '__all__'}:${face}:${industry || '__any__'}`;

  const clearSearch = useCallback(() => {
    setQueryState('');
  }, []);

  const retryLoad = useCallback(() => {
    setReloadNonce((current) => current + 1);
  }, []);

  const handleUpdateStanding = useCallback(
    async (account: ProfileListAccount, shouldStand: boolean) => {
      if (mergedPendingStandingIds.has(account.accountId)) {
        return;
      }

      setActionError(null);
      setPendingStandingIds((prev) => new Set(prev).add(account.accountId));

      try {
        await updateStanding(
          profileListAccountToStandingSummary(account),
          shouldStand
        );
        setProfiles((current) =>
          current.map((profile) =>
            profile.accountId === account.accountId
              ? {
                  ...profile,
                  viewerStanding: shouldStand,
                  standingSince: shouldStand
                    ? (profile.standingSince ?? Date.now())
                    : null,
                  standingBlockTimestamp: shouldStand
                    ? (profile.standingBlockTimestamp ?? Date.now())
                    : null,
                  standingCount: Math.max(
                    0,
                    profile.standingCount +
                      (shouldStand === profile.viewerStanding
                        ? 0
                        : shouldStand
                          ? 1
                          : -1)
                  ),
                }
              : profile
          )
        );
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : 'Could not update standing.'
        );
      } finally {
        setPendingStandingIds((prev) => {
          const next = new Set(prev);
          next.delete(account.accountId);
          return next;
        });
      }
    },
    [mergedPendingStandingIds, updateStanding]
  );

  return {
    query,
    setQuery,
    tab,
    setTab,
    face,
    setFace,
    industry,
    setIndustry,
    topicFilterPrefix,
    discoverableTotal,
    listAccounts,
    viewerAccountId: viewerAccountId ?? null,
    isConnected,
    walletLoading,
    connect,
    showConnectHint,
    loadError,
    actionError,
    subtitle,
    emptyState,
    isSearchEmpty,
    searchSettled,
    showListSkeleton,
    isListRefreshing,
    isLoadingMore,
    relationshipSynced,
    hasMore,
    showLoadMoreSentinel,
    loadMoreRef,
    footerSummary,
    listKey,
    clearSearch,
    retryLoad,
    isStandingPendingForTarget: isStandingPending,
    handleUpdateStanding,
  };
}
