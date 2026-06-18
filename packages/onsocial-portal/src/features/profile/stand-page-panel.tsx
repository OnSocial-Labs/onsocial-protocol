'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ProfileListLoadMoreFooter,
  ProfileListSkeletonRows,
  ProfileViewAllButton,
} from '@/features/profile/profile-list-loading';
import {
  buildStandViewOptions,
  ProfileListFilterRail,
} from '@/features/profile/profile-list-filter-rail';
import { StandingList } from '@/features/profile/standing-list';
import { useProfile } from '@/contexts/profile-context';
import {
  normalizeProfileSearchQuery,
  PROFILE_SEARCH_MIN_QUERY_LENGTH,
} from '@/lib/profile-account-search';
import { cleanHandle } from '@/lib/endorsements';
import {
  fetchProfileSocialStandings,
  formatProfileCount,
  mergeStandingAccounts,
  type StandingAccountSummary,
  type StanceDetailKind,
} from '@/lib/profile-social-standings';
import {
  getPortalDiscoverUrl,
  syncPortalStandUrl,
  type PortalStandKind,
} from '@/lib/portal-config';
import { fadeMotion } from '@/lib/motion';

function accountLabel(account: StandingAccountSummary): string {
  return account.name?.trim() || cleanHandle(account.accountId);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Profile request failed';
}

export function StandPagePanel({
  kind,
  accountId,
  displayName,
  isSelf,
  counts,
  metaLoaded = true,
  initialQuery = '',
  syncUrl = false,
  viewerAccountId,
  hasSocialSession = false,
  onSelectAccount,
  onUpdateAccountStanding,
  onCountsLoaded,
}: {
  kind: StanceDetailKind;
  accountId: string;
  displayName: string;
  isSelf: boolean;
  counts: { incoming: number; outgoing: number; mutual: number };
  metaLoaded?: boolean;
  initialQuery?: string;
  syncUrl?: boolean;
  viewerAccountId: string | null;
  hasSocialSession?: boolean;
  onSelectAccount?: (accountId: string) => void;
  onUpdateAccountStanding?: (
    account: StandingAccountSummary,
    shouldStand: boolean
  ) => Promise<void>;
  onCountsLoaded?: (counts: {
    incoming: number;
    outgoing: number;
    mutual: number;
  }) => void;
}) {
  const {
    standingSyncVersion,
    isStandingPendingForTarget,
    deriveStandingListAccounts,
    reconcileStandingListFromFetch,
    shouldFreshFetchStandingListFor,
  } = useProfile();
  const reduceMotion = useReducedMotion();
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const latestLoadRef = useRef(0);
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const [accounts, setAccounts] = useState<StandingAccountSummary[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingStandingIds, setPendingStandingIds] = useState<Set<string>>(
    () => new Set()
  );

  const normalizedQuery = normalizeProfileSearchQuery(query);
  const serverSearchActive =
    normalizedQuery.length >= PROFILE_SEARCH_MIN_QUERY_LENGTH;
  const searchQueryForFetch = serverSearchActive ? normalizedQuery : '';

  useEffect(() => {
    if (!syncUrl) return;
    syncPortalStandUrl(accountId, kind as PortalStandKind, {
      q: serverSearchActive ? normalizedQuery : null,
    });
  }, [accountId, kind, normalizedQuery, serverSearchActive, syncUrl]);

  const { accounts: displayAccounts, totalAdjustment: listTotalAdjustment } =
    useMemo(
      () =>
        deriveStandingListAccounts(accounts, kind, accountId, viewerAccountId),
      [
        accountId,
        accounts,
        deriveStandingListAccounts,
        kind,
        standingSyncVersion,
        viewerAccountId,
      ]
    );

  const totalCount = serverSearchActive
    ? listTotal
    : Math.max(
        0,
        (kind === 'incoming'
          ? counts.incoming
          : kind === 'outgoing'
            ? counts.outgoing
            : counts.mutual) + listTotalAdjustment
      );

  const mergedPendingStandingIds = useMemo(() => {
    const merged = new Set(pendingStandingIds);
    for (const account of displayAccounts) {
      if (isStandingPendingForTarget(account.accountId)) {
        merged.add(account.accountId);
      }
    }
    return merged;
  }, [
    displayAccounts,
    isStandingPendingForTarget,
    pendingStandingIds,
    standingSyncVersion,
  ]);

  const filteredAccounts = useMemo(() => {
    if (serverSearchActive) return displayAccounts;

    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return displayAccounts;

    return displayAccounts.filter((account) => {
      const label = accountLabel(account).toLowerCase();
      const accountIdLabel = account.accountId.toLowerCase();
      const bio = account.bio?.toLowerCase() ?? '';
      return (
        label.includes(normalizedQuery) ||
        accountIdLabel.includes(normalizedQuery) ||
        bio.includes(normalizedQuery)
      );
    });
  }, [displayAccounts, query, serverSearchActive]);

  useEffect(() => {
    const loadId = latestLoadRef.current + 1;
    latestLoadRef.current = loadId;
    setIsLoading(true);
    setLoadError(null);

    const timeout = window.setTimeout(
      () => {
        setIsLoadingMore(false);
        setHasMore(false);

        void fetchProfileSocialStandings(
          accountId,
          viewerAccountId,
          kind,
          0,
          searchQueryForFetch
        )
          .then((response) => {
            if (latestLoadRef.current !== loadId) return;
            reconcileStandingListFromFetch(response.accounts);
            setAccounts(response.accounts);
            setHasMore(response.hasMore);
            setListTotal(response.total);
            if (response.counts) {
              onCountsLoaded?.(response.counts);
            }
          })
          .catch((error) => {
            if (latestLoadRef.current !== loadId) return;
            setLoadError(getErrorMessage(error));
            setAccounts([]);
            setHasMore(false);
            setListTotal(0);
          })
          .finally(() => {
            if (latestLoadRef.current === loadId) setIsLoading(false);
          });
      },
      serverSearchActive ? 220 : 0
    );

    return () => window.clearTimeout(timeout);
  }, [
    accountId,
    kind,
    searchQueryForFetch,
    serverSearchActive,
    viewerAccountId,
  ]);

  useEffect(() => {
    if (
      !shouldFreshFetchStandingListFor(accountId, viewerAccountId, kind) ||
      serverSearchActive
    ) {
      return;
    }

    const timers = [2_000, 5_000].map((delay) =>
      window.setTimeout(() => {
        const loadId = latestLoadRef.current + 1;
        latestLoadRef.current = loadId;

        void fetchProfileSocialStandings(
          accountId,
          viewerAccountId,
          kind,
          0,
          searchQueryForFetch
        )
          .then((response) => {
            if (latestLoadRef.current !== loadId) return;
            reconcileStandingListFromFetch(response.accounts);
            setAccounts(response.accounts);
            setHasMore(response.hasMore);
            setListTotal(response.total);
            if (response.counts) {
              onCountsLoaded?.(response.counts);
            }
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
    kind,
    onCountsLoaded,
    reconcileStandingListFromFetch,
    searchQueryForFetch,
    serverSearchActive,
    shouldFreshFetchStandingListFor,
    standingSyncVersion,
    viewerAccountId,
  ]);

  const loadMore = useCallback(async () => {
    if (isLoading || isLoadingMore || !hasMore) return;

    const loadId = latestLoadRef.current;
    const offset = accounts.length;
    setIsLoadingMore(true);
    setLoadError(null);

    try {
      const response = await fetchProfileSocialStandings(
        accountId,
        viewerAccountId,
        kind,
        offset,
        searchQueryForFetch
      );
      if (latestLoadRef.current !== loadId) return;
      reconcileStandingListFromFetch(response.accounts);
      setAccounts((current) =>
        mergeStandingAccounts(current, response.accounts)
      );
      setHasMore(response.hasMore);
      setListTotal(response.total);
    } catch (error) {
      if (latestLoadRef.current !== loadId) return;
      setLoadError(getErrorMessage(error));
    } finally {
      if (latestLoadRef.current === loadId) setIsLoadingMore(false);
    }
  }, [
    accountId,
    accounts.length,
    hasMore,
    isLoading,
    isLoadingMore,
    kind,
    searchQueryForFetch,
    viewerAccountId,
    onCountsLoaded,
  ]);

  useEffect(() => {
    if (!hasMore || isLoading || isLoadingMore) return;

    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { rootMargin: '160px', threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [accounts.length, hasMore, isLoading, isLoadingMore, loadMore]);

  const resultsSummary = useMemo(() => {
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
    return `Showing ${shown}`;
  }, [
    displayAccounts.length,
    filteredAccounts.length,
    hasMore,
    isLoading,
    query,
    serverSearchActive,
    totalCount,
  ]);

  const emptyLabel =
    kind === 'mutual'
      ? 'No solidarity yet.'
      : kind === 'incoming'
        ? isSelf
          ? 'No one stands with you yet.'
          : `No one stands with ${displayName} yet.`
        : isSelf
          ? 'You do not stand with anyone yet.'
          : `${displayName} does not stand with anyone yet.`;

  const viewOptions = useMemo(
    () =>
      buildStandViewOptions({
        accountId,
        activeKind: kind,
        counts,
        isSelf,
      }),
    [accountId, counts, isSelf, kind]
  );

  const showListSkeleton =
    (!metaLoaded || isLoading) && filteredAccounts.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <ProfileListFilterRail
        menuLabel="Standing"
        options={viewOptions}
        activeOptionId={kind}
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search profiles"
        clearAriaLabel="Clear profile search"
        autoFocus={metaLoaded}
        isLoading={!metaLoaded}
      />

      {loadError ? (
        <p className="rounded-xl border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--portal-red)]">
          {loadError}
        </p>
      ) : null}

      <AnimatePresence initial={false} mode="wait">
        {showListSkeleton ? (
          <motion.div
            key="stand-list-loading"
            {...fadeMotion(reduceMotion ? 0 : 0.12)}
          >
            <ProfileListSkeletonRows variant="profile" count={6} />
          </motion.div>
        ) : (
          <motion.div
            key="stand-list-loaded"
            {...fadeMotion(reduceMotion ? 0 : 0.14)}
          >
            <StandingList
              layout="page"
              accounts={filteredAccounts}
              hasSocialSession={hasSocialSession}
              emptyLabel={query.trim() ? 'No matching profiles.' : emptyLabel}
              emptyCta={
                !query.trim() && kind === 'outgoing' ? (
                  <Link
                    href={getPortalDiscoverUrl()}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--portal-blue)] transition-colors hover:text-[var(--portal-blue-hover)]"
                  >
                    Find someone to stand with
                  </Link>
                ) : undefined
              }
              onSelectAccount={onSelectAccount}
              viewerAccountId={viewerAccountId}
              pendingStandingIds={mergedPendingStandingIds}
              onUpdateStanding={async (account, shouldStand) => {
                if (
                  !onUpdateAccountStanding ||
                  mergedPendingStandingIds.has(account.accountId)
                ) {
                  return;
                }
                setPendingStandingIds((prev) =>
                  new Set(prev).add(account.accountId)
                );
                try {
                  await onUpdateAccountStanding(account, shouldStand);
                } catch {
                  // Parent surfaces transaction errors.
                } finally {
                  setPendingStandingIds((prev) => {
                    const next = new Set(prev);
                    next.delete(account.accountId);
                    return next;
                  });
                }
              }}
            />
            {!query.trim() && filteredAccounts.length > 0 ? (
              <ProfileListLoadMoreFooter
                loadMoreSentinelRef={loadMoreSentinelRef}
                resultsSummary={resultsSummary}
                isLoadingMore={isLoadingMore}
                skeletonVariant="profile"
              />
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
