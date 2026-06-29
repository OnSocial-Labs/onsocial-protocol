'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from 'react';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { usePortfolioProfileSeed } from '@/contexts/portfolio-profile-seed-context';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import { useViewerStanding } from '@/hooks/use-viewer-standing';
import {
  normalizeProfileSearchQuery,
  PROFILE_SEARCH_MIN_QUERY_LENGTH,
} from '@/lib/profile-account-search';
import { replaceBrowserQueryUrl, replaceBrowserUrl } from '@/lib/sync-browser-url-query';
import { isStandingListCacheDisplayReady } from '@/lib/profile-list-display';
import {
  readStandingListCache,
  standingListCacheKey,
  writeStandingListCache,
} from '@/lib/standing-list-cache';
import {
  buildStandingEmptyState,
  type StandingPanelEmptyState,
} from '@/lib/standing-empty-state';
import {
  fetchProfileSocialStandings,
  formatProfileCount,
  mergeStandingAccounts,
  parseStandingKindFromPathname,
  standingPath,
  type StanceDetailKind,
  type StandingAccountSummary,
} from '@/lib/profile-social-standings';
import type { StandingInitialList } from '@/lib/load-standing-list-page';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export type StandingShellVariant = 'overlay' | 'page';

export interface StandingPanelProviderProps {
  accountId: string;
  displayName: string;
  avatarUrl?: string | null;
  kind: StanceDetailKind;
  initialCounts: {
    incoming: number;
    outgoing: number;
    mutual: number;
  };
  initialQuery?: string;
  initialList?: StandingInitialList | null;
  /** Server bootstrap from intercept/full-page route (shell + list on first paint). */
  profileMetaFromServer?: boolean;
  syncUrl?: boolean;
  shellVariant?: StandingShellVariant;
  scrollRootRef?: RefObject<Element | null>;
  children: ReactNode;
}

interface StandingPanelContextValue {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
  shellVariant: StandingShellVariant;
  showDiscoverLink: boolean;
  kind: StanceDetailKind;
  counts: { incoming: number; outgoing: number; mutual: number };
  isSelf: boolean;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  viewerAccountId: string | null;
  isConnected: boolean;
  filteredAccounts: StandingAccountSummary[];
  mergedPendingIds: Set<string>;
  loadError: string | null;
  actionError: string | null;
  summary: string | null;
  emptyState: StandingPanelEmptyState;
  clearSearch: () => void;
  showSubjectSkeleton: boolean;
  countsLoading: boolean;
  showListSkeleton: boolean;
  isListRefreshing: boolean;
  isLoadingMore: boolean;
  showLoadMoreSentinel: boolean;
  loadMoreRef: React.RefObject<HTMLDivElement | null>;
  footerSummary: string | null;
  listKey: string;
  retryLoad: () => void;
  navigateKind: (nextKind: StanceDetailKind) => void;
  handleUpdateStanding: (
    account: StandingAccountSummary,
    shouldStand: boolean
  ) => Promise<void>;
}

const StandingPanelContext = createContext<StandingPanelContextValue | null>(
  null
);

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Could not load standing list';
}

function accountLabel(account: StandingAccountSummary): string {
  return account.name?.trim() || `@${account.accountId}`;
}

function hasStandingCounts(counts: {
  incoming: number;
  outgoing: number;
  mutual: number;
}): boolean {
  return counts.incoming > 0 || counts.outgoing > 0 || counts.mutual > 0;
}

function hasSsrProfileMeta(
  accountId: string,
  profileDisplayName: string,
  profileAvatarUrl: string | null | undefined,
  counts: { incoming: number; outgoing: number; mutual: number }
): boolean {
  return (
    profileDisplayName !== accountId ||
    Boolean(profileAvatarUrl) ||
    hasStandingCounts(counts)
  );
}

async function fetchProfileShellClient(accountId: string): Promise<{
  displayName?: string;
  avatarUrl?: string | null;
} | null> {
  const response = await fetch(
    `/api/profile/shell?accountId=${encodeURIComponent(accountId)}`,
    { cache: 'no-store' }
  );
  if (!response.ok) {
    return null;
  }
  return (await response.json().catch(() => null)) as {
    displayName?: string;
    avatarUrl?: string | null;
  } | null;
}

export function StandingPanelProvider({
  accountId,
  displayName,
  avatarUrl = null,
  kind,
  initialCounts,
  initialQuery = '',
  initialList = null,
  profileMetaFromServer = false,
  syncUrl = true,
  shellVariant = 'overlay',
  scrollRootRef,
  children,
}: StandingPanelProviderProps) {
  const portfolioSeed = usePortfolioProfileSeed(accountId);
  const { accountId: viewerAccountId, isLoading: walletLoading } = useAppWallet();
  const {
    isConnected,
    standingSyncVersion,
    deriveStandingListAccounts,
    reconcileStandingListFromFetch,
    shouldFreshFetchStandingListFor,
    isStandingPendingForTarget,
    updateStanding,
  } = useViewerStanding(accountId);

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const loadIdRef = useRef(0);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [profileDisplayName, setProfileDisplayName] = useState(
    () => portfolioSeed?.displayName ?? displayName
  );
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(
    () => portfolioSeed?.avatarUrl ?? avatarUrl ?? null
  );
  const [metaLoaded, setMetaLoaded] = useState(
    () =>
      Boolean(portfolioSeed) ||
      shellVariant === 'page' ||
      profileMetaFromServer ||
      hasSsrProfileMeta(accountId, displayName, avatarUrl, initialCounts)
  );
  const [countsHydrated, setCountsHydrated] = useState(
    () =>
      Boolean(portfolioSeed) ||
      shellVariant === 'page' ||
      profileMetaFromServer ||
      hasStandingCounts(initialCounts)
  );
  const [query, setQuery] = useState(initialQuery);
  const [activeKind, setActiveKind] = useState(kind);
  const standingSyncPath = useMemo(
    () => standingPath(accountId, activeKind),
    [accountId, activeKind]
  );
  const [counts, setCounts] = useState(
    () => portfolioSeed?.counts ?? initialCounts
  );
  const [accounts, setAccounts] = useState<StandingAccountSummary[]>(
    () => initialList?.accounts ?? []
  );
  const [listTotal, setListTotal] = useState(() => initialList?.total ?? 0);
  const [hasMore, setHasMore] = useState(() => initialList?.hasMore ?? false);
  const [isLoading, setIsLoading] = useState(() => initialList == null);
  const [isListRefreshing, setIsListRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [localPendingIds, setLocalPendingIds] = useState<Set<string>>(
    () => new Set()
  );
  const [relationshipSynced, setRelationshipSynced] = useState(false);
  const viewerKey = viewerAccountId ?? null;

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    setActiveKind(kind);
  }, [kind]);

  useEffect(() => {
    if (!portfolioSeed) {
      return;
    }
    setProfileDisplayName(portfolioSeed.displayName);
    setProfileAvatarUrl(portfolioSeed.avatarUrl);
    setCounts(portfolioSeed.counts);
    setMetaLoaded(true);
    setCountsHydrated(true);
  }, [portfolioSeed]);

  useEffect(() => {
    if (metaLoaded) {
      return;
    }

    let cancelled = false;
    void fetchProfileShellClient(accountId)
      .then((body) => {
        if (cancelled) {
          return;
        }
        if (body?.displayName) {
          setProfileDisplayName(body.displayName);
        }
        if (body && 'avatarUrl' in body) {
          setProfileAvatarUrl(body.avatarUrl ?? null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMetaLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, metaLoaded]);

  const normalizedQuery = normalizeProfileSearchQuery(query);
  const serverSearchActive =
    normalizedQuery.length >= PROFILE_SEARCH_MIN_QUERY_LENGTH;
  const searchQueryForFetch = serverSearchActive ? normalizedQuery : '';

  useEffect(() => {
    if (!syncUrl) return;

    const params = new URLSearchParams(window.location.search);
    if (serverSearchActive) {
      params.set('q', normalizedQuery);
    } else {
      params.delete('q');
    }

    replaceBrowserQueryUrl(standingSyncPath, params);
  }, [normalizedQuery, standingSyncPath, serverSearchActive, syncUrl]);

  useEffect(() => {
    if (!syncUrl) {
      return;
    }

    const handlePopState = () => {
      setQuery(
        normalizeProfileSearchQuery(
          new URLSearchParams(window.location.search).get('q')
        )
      );

      const kindFromUrl = parseStandingKindFromPathname(
        window.location.pathname
      );
      if (kindFromUrl) {
        setActiveKind(kindFromUrl);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [syncUrl]);

  const navigateKind = useCallback(
    (nextKind: StanceDetailKind) => {
      if (!syncUrl || nextKind === activeKind) {
        return;
      }

      setActiveKind(nextKind);
      replaceBrowserUrl(standingPath(accountId, nextKind, query));

      const scrollRoot = scrollRootRef?.current;
      if (scrollRoot && 'scrollTop' in scrollRoot) {
        scrollRoot.scrollTop = 0;
      }
    },
    [accountId, activeKind, query, scrollRootRef, syncUrl]
  );

  const isSelf = Boolean(viewerAccountId && viewerAccountId === accountId);
  const showDiscoverLink = isSelf && activeKind === 'outgoing';

  const { accounts: displayAccounts, totalAdjustment: listTotalAdjustment } =
    useMemo(
      () =>
        deriveStandingListAccounts(accounts, activeKind, viewerAccountId ?? null),
      [accounts, deriveStandingListAccounts, activeKind, viewerAccountId]
    );

  const totalCount = serverSearchActive
    ? listTotal
    : Math.max(
        0,
        (activeKind === 'incoming'
          ? counts.incoming
          : activeKind === 'outgoing'
            ? counts.outgoing
            : counts.mutual) + listTotalAdjustment
      );

  const filteredAccounts = useMemo(() => {
    if (serverSearchActive) return displayAccounts;

    const localQuery = query.trim().toLowerCase();
    if (!localQuery) return displayAccounts;

    return displayAccounts.filter((account) => {
      const label = accountLabel(account).toLowerCase();
      const accountIdLabel = account.accountId.toLowerCase();
      const bio = account.bio?.toLowerCase() ?? '';
      return (
        label.includes(localQuery) ||
        accountIdLabel.includes(localQuery) ||
        bio.includes(localQuery)
      );
    });
  }, [displayAccounts, query, serverSearchActive]);

  const mergedPendingIds = useMemo(() => {
    void standingSyncVersion;
    const merged = new Set(localPendingIds);
    for (const account of filteredAccounts) {
      if (isStandingPendingForTarget(account.accountId)) {
        merged.add(account.accountId);
      }
    }
    return merged;
  }, [
    filteredAccounts,
    isStandingPendingForTarget,
    localPendingIds,
    standingSyncVersion,
  ]);

  useEffect(() => {
    if (walletLoading) {
      return;
    }

    const loadId = ++loadIdRef.current;
    const cacheKey = standingListCacheKey(
      accountId,
      activeKind,
      searchQueryForFetch,
      viewerKey
    );
    const canUseInitialList =
      initialList != null &&
      activeKind === kind &&
      searchQueryForFetch === normalizeProfileSearchQuery(initialQuery);
    const bootstrap = canUseInitialList
      ? {
          viewerAccountId: null,
          accounts: initialList.accounts,
          listTotal: initialList.total,
          hasMore: initialList.hasMore,
          counts: initialList.counts,
        }
      : undefined;
    const cachedEntry = readStandingListCache(cacheKey) ?? bootstrap;
    const cacheReady =
      cachedEntry != null &&
      isStandingListCacheDisplayReady(cachedEntry, viewerKey);

    if (cachedEntry && cacheReady) {
      setAccounts(cachedEntry.accounts);
      setListTotal(cachedEntry.listTotal);
      setHasMore(cachedEntry.hasMore);
      if (cachedEntry.counts) {
        setCounts(cachedEntry.counts);
        setCountsHydrated(true);
      }
      setIsLoading(false);
      setIsListRefreshing(true);
      setLoadError(null);
      setRelationshipSynced(true);
      writeStandingListCache(cacheKey, cachedEntry);
    } else if (canUseInitialList) {
      setAccounts(initialList.accounts);
      setListTotal(initialList.total);
      setHasMore(initialList.hasMore);
      if (initialList.counts) {
        setCounts(initialList.counts);
        setCountsHydrated(true);
      }
      setIsLoading(false);
      setIsListRefreshing(true);
      setLoadError(null);
      setRelationshipSynced(false);
    } else {
      setAccounts([]);
      setListTotal(0);
      setHasMore(false);
      setIsLoading(true);
      setIsListRefreshing(false);
      setLoadError(null);
      setRelationshipSynced(false);
    }
    setIsLoadingMore(false);

    const timeout = window.setTimeout(
      () => {
        setIsLoadingMore(false);
        setHasMore(false);

        void fetchProfileSocialStandings(
          accountId,
          viewerAccountId ?? null,
          activeKind,
          0,
          searchQueryForFetch
        )
          .then((response) => {
            if (loadIdRef.current !== loadId) return;
            reconcileStandingListFromFetch(response.accounts);
            setAccounts(response.accounts);
            setHasMore(response.hasMore);
            setListTotal(response.total);
            if (response.counts) {
              setCounts(response.counts);
            }
            setCountsHydrated(true);
            writeStandingListCache(cacheKey, {
              viewerAccountId: viewerKey,
              accounts: response.accounts,
              listTotal: response.total,
              hasMore: response.hasMore,
              counts: response.counts,
            });
          })
          .catch((error) => {
            if (loadIdRef.current !== loadId) return;
            if (!cacheReady) {
              setLoadError(getErrorMessage(error));
              setAccounts([]);
              setHasMore(false);
              setListTotal(0);
            }
            setCountsHydrated(true);
          })
          .finally(() => {
            if (loadIdRef.current === loadId) {
              setIsLoading(false);
              setIsListRefreshing(false);
              setRelationshipSynced(true);
            }
          });
      },
      serverSearchActive ? 220 : 0
    );

    return () => window.clearTimeout(timeout);
  }, [
    accountId,
    initialList,
    initialQuery,
    activeKind,
    kind,
    reconcileStandingListFromFetch,
    reloadNonce,
    searchQueryForFetch,
    serverSearchActive,
    viewerAccountId,
    viewerKey,
    walletLoading,
  ]);

  useEffect(() => {
    if (
      !shouldFreshFetchStandingListFor(accountId, viewerAccountId ?? null, activeKind) ||
      serverSearchActive
    ) {
      return;
    }

    const timers = [2_000, 5_000].map((delay) =>
      window.setTimeout(() => {
        const loadId = ++loadIdRef.current;
        void fetchProfileSocialStandings(
          accountId,
          viewerAccountId ?? null,
          activeKind,
          0,
          searchQueryForFetch
        )
          .then((response) => {
            if (loadIdRef.current !== loadId) return;
            reconcileStandingListFromFetch(response.accounts);
            setAccounts(response.accounts);
            setHasMore(response.hasMore);
            setListTotal(response.total);
            if (response.counts) {
              setCounts(response.counts);
            }
            writeStandingListCache(
              standingListCacheKey(
                accountId,
                activeKind,
                searchQueryForFetch,
                viewerKey
              ),
              {
                viewerAccountId: viewerKey,
                accounts: response.accounts,
                listTotal: response.total,
                hasMore: response.hasMore,
                counts: response.counts,
              }
            );
          })
          .catch(() => {
            // Keep ledger-derived rows if background revalidation is slow.
          });
      }, delay)
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [
    accountId,
    activeKind,
    reconcileStandingListFromFetch,
    searchQueryForFetch,
    serverSearchActive,
    shouldFreshFetchStandingListFor,
    standingSyncVersion,
    viewerAccountId,
    viewerKey,
  ]);

  const loadMore = useCallback(async () => {
    if (isLoading || isLoadingMore || !hasMore) return;

    const loadId = ++loadIdRef.current;
    const offset = accounts.length;
    setIsLoadingMore(true);
    setLoadError(null);

    try {
      const response = await fetchProfileSocialStandings(
        accountId,
        viewerAccountId ?? null,
        activeKind,
        offset,
        searchQueryForFetch
      );
      if (loadIdRef.current !== loadId) return;
      reconcileStandingListFromFetch(response.accounts);
      setAccounts((current) => {
        const merged = mergeStandingAccounts(current, response.accounts);
        writeStandingListCache(
          standingListCacheKey(
            accountId,
            activeKind,
            searchQueryForFetch,
            viewerKey
          ),
          {
            viewerAccountId: viewerKey,
            accounts: merged,
            listTotal: response.total,
            hasMore: response.hasMore,
          }
        );
        return merged;
      });
      setHasMore(response.hasMore);
      setListTotal(response.total);
    } catch (error) {
      if (loadIdRef.current !== loadId) return;
      setLoadError(getErrorMessage(error));
    } finally {
      if (loadIdRef.current === loadId) {
        setIsLoadingMore(false);
      }
    }
  }, [
    accountId,
    accounts.length,
    hasMore,
    isLoading,
    isLoadingMore,
    activeKind,
    reconcileStandingListFromFetch,
    searchQueryForFetch,
    viewerAccountId,
    viewerKey,
  ]);

  const handleUpdateStanding = useCallback(
    async (account: StandingAccountSummary, shouldStand: boolean) => {
      if (mergedPendingIds.has(account.accountId)) {
        return;
      }

      setActionError(null);
      setLocalPendingIds((prev) => new Set(prev).add(account.accountId));

      try {
        await updateStanding(account, shouldStand);
        setAccounts((current) =>
          current.map((row) =>
            row.accountId === account.accountId
              ? { ...row, viewerStanding: shouldStand }
              : row
          )
        );
      } catch (error) {
        if (!isWalletUserCancellation(error)) {
          setActionError(getErrorMessage(error));
        }
      } finally {
        setLocalPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(account.accountId);
          return next;
        });
      }
    },
    [mergedPendingIds, updateStanding]
  );

  const emptyState = useMemo(
    () =>
      buildStandingEmptyState({
        kind: activeKind,
        isSelf,
        displayName: profileDisplayName,
        query,
        showDiscoverLink,
      }),
    [isSelf, activeKind, profileDisplayName, query, showDiscoverLink]
  );

  const clearSearch = useCallback(() => {
    setQuery('');
  }, []);

  const summary = useMemo(() => {
    if (filteredAccounts.length === 0 && isLoading) return null;

    const shown = formatProfileCount(
      serverSearchActive || query.trim()
        ? filteredAccounts.length
        : displayAccounts.length
    );

    if (serverSearchActive) {
      if (totalCount > 0) {
        return hasMore
          ? `Showing ${shown} of ${formatProfileCount(totalCount)} matching profiles`
          : `${formatProfileCount(totalCount)} matching profile${totalCount === 1 ? '' : 's'}`;
      }
      return hasMore
        ? `Showing ${shown} matching profiles`
        : `${shown} matching profile${filteredAccounts.length === 1 ? '' : 's'}`;
    }

    if (query.trim()) {
      return hasMore
        ? `Showing ${shown} matching profiles`
        : `${shown} matching profile${filteredAccounts.length === 1 ? '' : 's'}`;
    }

    if (totalCount > 0) {
      return `Showing ${shown} of ${formatProfileCount(totalCount)}`;
    }

    return null;
  }, [
    displayAccounts.length,
    filteredAccounts.length,
    hasMore,
    isLoading,
    query,
    serverSearchActive,
    totalCount,
  ]);

  const showSubjectSkeleton = !metaLoaded;
  const countsLoading = !countsHydrated && isLoading;
  const listBootstrapReady = useMemo(
    () =>
      initialList != null &&
      activeKind === kind &&
      normalizeProfileSearchQuery(query) ===
        normalizeProfileSearchQuery(initialQuery),
    [initialList, activeKind, kind, query, initialQuery]
  );
  const hasListRows = filteredAccounts.length > 0;
  const showListSkeleton =
    walletLoading ||
    (!listBootstrapReady && isLoading && !hasListRows) ||
    (!listBootstrapReady && !relationshipSynced && !hasListRows);
  const showLoadMoreSentinel =
    hasMore && !query.trim() && filteredAccounts.length > 0;

  useInfiniteScrollSentinel({
    scrollRootRef,
    sentinelRef: loadMoreRef,
    enabled: showLoadMoreSentinel && !isLoading && !isLoadingMore,
    onIntersect: () => {
      void loadMore();
    },
  });

  const footerSummary =
    filteredAccounts.length > 0 && !showListSkeleton ? summary : null;
  const listKey = `${activeKind}:${query.trim() || '__all__'}`;

  const retryLoad = useCallback(() => {
    setReloadNonce((current) => current + 1);
  }, []);

  const value = useMemo<StandingPanelContextValue>(
    () => ({
      accountId,
      displayName: profileDisplayName,
      avatarUrl: profileAvatarUrl,
      shellVariant,
      showDiscoverLink,
      kind: activeKind,
      counts,
      isSelf,
      query,
      setQuery,
      viewerAccountId: viewerAccountId ?? null,
      isConnected,
      filteredAccounts,
      mergedPendingIds,
      loadError,
      actionError,
      summary,
      emptyState,
      clearSearch,
      showSubjectSkeleton,
      countsLoading,
      showListSkeleton,
      isListRefreshing,
      isLoadingMore,
      showLoadMoreSentinel,
      loadMoreRef,
      footerSummary,
      handleUpdateStanding,
      listKey,
      retryLoad,
      navigateKind,
    }),
    [
      accountId,
      actionError,
      counts,
      countsLoading,
      clearSearch,
      emptyState,
      filteredAccounts,
      footerSummary,
      handleUpdateStanding,
      isConnected,
      isListRefreshing,
      isLoadingMore,
      isSelf,
      activeKind,
      listKey,
      loadError,
      mergedPendingIds,
      navigateKind,
      profileAvatarUrl,
      profileDisplayName,
      query,
      retryLoad,
      shellVariant,
      showDiscoverLink,
      showListSkeleton,
      showLoadMoreSentinel,
      showSubjectSkeleton,
      summary,
      viewerAccountId,
    ]
  );

  return (
    <StandingPanelContext.Provider value={value}>
      {children}
    </StandingPanelContext.Provider>
  );
}

export function useStandingPanel(): StandingPanelContextValue {
  const context = useContext(StandingPanelContext);
  if (!context) {
    throw new Error('useStandingPanel must be used within StandingPanelProvider');
  }
  return context;
}
