'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import { useViewerStanding } from '@/hooks/use-viewer-standing';
import { buildDiscoverEmptyState } from '@/lib/discover-empty-state';
import {
  buildDiscoverListSummary,
  formatDiscoverSubtitle,
} from '@/lib/discover-list-summary';
import {
  discoverProfileToProfileListAccount,
  fetchDiscoverProfiles,
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

  const [query, setQuery] = useState(() =>
    normalizeProfileSearchQuery(searchParams.get('q'))
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

  const normalizedQuery = normalizeProfileSearchQuery(query);

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
    if (normalizedQuery) {
      params.set('q', normalizedQuery);
    } else {
      params.delete('q');
    }

    replaceBrowserQueryUrl(pathname, params);
  }, [normalizedQuery, pathname]);

  useEffect(() => {
    const handlePopState = () => {
      setQuery(
        normalizeProfileSearchQuery(
          new URLSearchParams(window.location.search).get('q')
        )
      );
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
          controller.signal
        );
        if (loadIdRef.current !== loadId) return;

        setProfiles((current) => {
          const merged = append
            ? mergeDiscoverProfiles(current, response.profiles)
            : response.profiles;
          writeDiscoverListCache(
            discoverListCacheKey(normalizedQuery, viewerKey),
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
    [normalizedQuery, viewerAccountId, viewerKey]
  );

  useEffect(() => {
    if (walletLoading) {
      return;
    }

    const loadId = ++loadIdRef.current;
    pageAbortRef.current?.abort();
    const controller = new AbortController();
    pageAbortRef.current = controller;

    const cacheKey = discoverListCacheKey(normalizedQuery, viewerKey);
    const canUseInitialPage =
      initialPage != null &&
      normalizedQuery === normalizeProfileSearchQuery(initialPage.query);
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
        controller.signal
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
    initialPage,
    normalizedQuery,
    reloadNonce,
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
    () => profiles.map(discoverProfileToProfileListAccount),
    [profiles]
  );

  const footerSummary = useMemo(() => {
    if (isLoading && profiles.length === 0) return null;

    return buildDiscoverListSummary({
      shownCount: profiles.length,
      hasMore,
      query,
      discoverableTotal,
      indexedProfileTotal,
    });
  }, [
    discoverableTotal,
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
    () => buildDiscoverEmptyState(query),
    [query]
  );

  const listBootstrapReady = useMemo(
    () =>
      initialPage != null &&
      normalizedQuery === normalizeProfileSearchQuery(initialPage.query),
    [initialPage, normalizedQuery]
  );
  const hasListRows = profiles.length > 0;

  const showConnectHint = !walletLoading && !isConnected;
  const showListSkeleton =
    walletLoading ||
    (!listBootstrapReady && isLoading && !hasListRows) ||
    (!listBootstrapReady && !relationshipSynced && !hasListRows);
  const isSearchEmpty = Boolean(normalizedQuery);
  const listKey = normalizedQuery || '__all__';

  const clearSearch = useCallback(() => {
    setQuery('');
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
          error instanceof Error
            ? error.message
            : 'Could not update standing.'
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
    showListSkeleton,
    isListRefreshing,
    isLoadingMore,
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
