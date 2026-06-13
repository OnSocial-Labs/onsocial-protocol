'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { User } from 'lucide-react';
import type { MaterialisedProfile } from '@onsocial/sdk';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import { profileSocialStandingButtonClass } from '@/components/ui/profile-action-pill';
import {
  ProfileSocialStandingPending,
  ProfileSocialStandingToggle,
} from '@/components/ui/profile-social-standing-toggle';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { RelationshipSignal } from '@/components/ui/relationship-signal';
import { SearchInput } from '@/components/ui/search-input';
import {
  ProfileListLoadMoreFooter,
  ProfileListSkeletonRows,
} from '@/features/profile/profile-list-loading';
import { profileListResultRowClass } from '@/features/profile/profile-list-row';
import { fadeMotion } from '@/lib/motion';
import { getPortalProfileUrl } from '@/lib/portal-config';
import { cn } from '@/lib/utils';

export interface ProfileDiscoverResult {
  accountId: string;
  profile: MaterialisedProfile | null;
  avatarUrl: string | null;
  standingCount: number;
  standingWithCount: number;
  mutualStandingCount: number;
  endorsementsReceivedCount: number;
  endorsementsGivenCount: number;
  firstProfileTimestamp: number | null;
  standingSince?: number | null;
  standingBlockTimestamp?: number | null;
  viewerStanding: boolean;
  theyStandWithViewer: boolean;
  targetEndorsedViewer: boolean;
}

interface ProfileDiscoverResponse {
  query: string;
  limit: number;
  offset: number;
  hasMore: boolean;
  results: ProfileDiscoverResult[];
}

interface ProtocolPulseTotals {
  discoverableProfiles?: number;
  profiles?: number;
}

interface ProtocolPulseResponse {
  totals?: ProtocolPulseTotals;
}

const DISCOVERY_PAGE_SIZE = 24;

const discoveryResultRowClass = profileListResultRowClass;

const discoveryProfileTargetClass =
  'group flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left focus-visible:outline-none';

function DiscoveryProfileTarget({
  accountId,
  pageLayout,
  onSelectAccount,
  children,
}: {
  accountId: string;
  pageLayout: boolean;
  onSelectAccount?: (accountId: string) => void;
  children: ReactNode;
}) {
  if (pageLayout) {
    return (
      <Link
        href={getPortalProfileUrl(accountId)}
        prefetch
        className={discoveryProfileTargetClass}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelectAccount?.(accountId)}
      className={discoveryProfileTargetClass}
    >
      {children}
    </button>
  );
}

export interface ProfileDiscoveryPanelProps {
  active?: boolean;
  viewerAccountId: string | null;
  hasSocialSession?: boolean;
  totalProfiles?: number | null;
  query?: string;
  onQueryChange?: (value: string) => void;
  showSearch?: boolean;
  /** Embedded/modal only — page layout uses Next.js Link for profile rows. */
  onSelectAccount?: (accountId: string) => void;
  onUpdateStanding?: (
    accountId: string,
    shouldStand: boolean
  ) => Promise<unknown>;
  /** When set, infinite scroll observes this element instead of the viewport. */
  scrollRootRef?: RefObject<HTMLElement | null>;
  /** Scroll results inside a fixed-height container (modal use). */
  containedScroll?: boolean;
  className?: string;
  searchClassName?: string;
  resultsClassName?: string;
  autoFocusSearch?: boolean;
  /** Page: full-width hovers; embedded/modal: inset rounded rows. */
  layout?: 'page' | 'embedded';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Profile discovery failed';
}

function cleanHandle(accountId: string): string {
  return accountId.replace(/\.(testnet|near|tg)$/u, '');
}

function displayName(result: ProfileDiscoverResult): string {
  return result.profile?.name?.trim() || cleanHandle(result.accountId);
}

function profileBio(result: ProfileDiscoverResult): string | null {
  const bio = result.profile?.bio?.trim();
  return bio || null;
}

function formatCount(count: number): string {
  const numericCount = Number(count);
  if (!Number.isFinite(numericCount)) return '0';

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits:
      Math.abs(numericCount) >= 1000 && Math.abs(numericCount) < 100000 ? 1 : 0,
    notation: Math.abs(numericCount) >= 1000 ? 'compact' : 'standard',
  }).format(numericCount);
}

function normalizeSocialTimestamp(value?: number | null): number | null {
  if (!value || !Number.isFinite(value) || value <= 0) return null;
  if (value > 1_000_000_000_000_000) return Math.floor(value / 1_000_000);
  if (value < 1_000_000_000_000) return value * 1000;
  return value;
}

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return '';
  const diff = Math.max(0, Date.now() - timestamp);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp));
}

function standingTimeMeta(
  result: ProfileDiscoverResult
): { label: string; description: string } | null {
  const since = normalizeSocialTimestamp(result.standingSince);
  if (since) {
    const label = formatRelativeTime(since);
    return { label, description: `Standing since ${label}` };
  }
  const added = normalizeSocialTimestamp(result.standingBlockTimestamp);
  if (!added) return null;
  const label = formatRelativeTime(added);
  return { label, description: `Standing added ${label}` };
}

function mergeDiscoverResults(
  current: ProfileDiscoverResult[],
  incoming: ProfileDiscoverResult[]
): ProfileDiscoverResult[] {
  if (incoming.length === 0) return current;

  const seen = new Set(current.map((result) => result.accountId));
  const merged = [...current];
  for (const result of incoming) {
    if (seen.has(result.accountId)) continue;
    seen.add(result.accountId);
    merged.push(result);
  }
  return merged;
}

function normalizeDiscoverResults(
  results: ProfileDiscoverResult[] | undefined
): ProfileDiscoverResult[] {
  return (results ?? []).map((result) => ({
    ...result,
    viewerStanding: Boolean(result.viewerStanding),
    theyStandWithViewer: Boolean(result.theyStandWithViewer),
    targetEndorsedViewer: Boolean(result.targetEndorsedViewer),
  }));
}

function isDiscoverRateLimitResponse(
  status: number,
  body: { error?: string; detail?: string } | null
): boolean {
  if (status === 429) return true;
  const message = `${body?.error ?? ''} ${body?.detail ?? ''}`;
  return /HTTP 429|rate limit|busy/i.test(message);
}

async function fetchProfileDiscovery(
  query: string,
  viewerAccountId: string | null,
  offset: number,
  signal?: AbortSignal
): Promise<ProfileDiscoverResponse> {
  const search = new URLSearchParams({
    limit: String(DISCOVERY_PAGE_SIZE),
    offset: String(offset),
  });
  if (query.trim()) search.set('q', query.trim());
  if (viewerAccountId) search.set('viewerAccountId', viewerAccountId);

  const url = `/api/profile/discover?${search.toString()}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 900);
      });
    }

    const response = await fetch(url, { cache: 'no-store', signal });
    const body = (await response.json().catch(() => null)) as
      | (Partial<ProfileDiscoverResponse> & { error?: string; detail?: string })
      | null;

    if (response.ok) {
      return {
        query: body?.query ?? query,
        limit: body?.limit ?? DISCOVERY_PAGE_SIZE,
        offset: body?.offset ?? offset,
        hasMore: Boolean(body?.hasMore),
        results: normalizeDiscoverResults(body?.results),
      };
    }

    lastError = new Error(
      body?.detail ??
        body?.error ??
        `Profile discovery failed (${response.status})`
    );

    if (!isDiscoverRateLimitResponse(response.status, body)) {
      throw lastError;
    }
  }

  throw lastError ?? new Error('Profile discovery failed (429)');
}

function ProfileAvatar({
  avatarUrl,
  className,
}: {
  avatarUrl: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/50 bg-muted/30 text-muted-foreground',
        className
      )}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <User className="h-4 w-4" />
      )}
    </div>
  );
}

export { ProfileDiscoverySearchRail } from '@/features/profile/profile-list-search-bar';

export function ProfileDiscoveryPanel({
  active = true,
  viewerAccountId,
  hasSocialSession = false,
  totalProfiles = null,
  query: queryProp,
  onQueryChange,
  showSearch = true,
  onSelectAccount,
  onUpdateStanding,
  scrollRootRef,
  containedScroll = false,
  className,
  searchClassName,
  resultsClassName,
  autoFocusSearch = false,
  layout = 'embedded',
}: ProfileDiscoveryPanelProps) {
  const pageLayout = layout === 'page';
  const reduceMotion = useReducedMotion();
  const [internalQuery, setInternalQuery] = useState('');
  const query = queryProp ?? internalQuery;
  const setQuery = onQueryChange ?? setInternalQuery;
  const [results, setResults] = useState<ProfileDiscoverResult[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [protocolPulseTotals, setProtocolPulseTotals] =
    useState<ProtocolPulseTotals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingStandingIds, setPendingStandingIds] = useState<Set<string>>(
    () => new Set()
  );
  const latestLoadRef = useRef(0);
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const trimmedQuery = query.trim();
  const discoverableTotal =
    totalProfiles ??
    protocolPulseTotals?.discoverableProfiles ??
    protocolPulseTotals?.profiles ??
    null;
  const indexedProfileTotal = protocolPulseTotals?.profiles ?? null;
  const resultsSummary = useMemo(() => {
    if (results.length === 0) return null;

    const shown = formatCount(results.length);
    if (trimmedQuery) {
      return hasMore
        ? `Showing ${shown} matching profiles`
        : `${shown} matching profile${results.length === 1 ? '' : 's'}`;
    }
    if (typeof discoverableTotal === 'number' && discoverableTotal > 0) {
      const ofDiscoverable = `Showing ${shown} of ${formatCount(discoverableTotal)} discoverable`;
      if (
        typeof indexedProfileTotal === 'number' &&
        indexedProfileTotal > discoverableTotal
      ) {
        return `${ofDiscoverable} · ${formatCount(indexedProfileTotal)} indexed`;
      }
      return ofDiscoverable;
    }
    return `Showing ${shown}`;
  }, [
    discoverableTotal,
    hasMore,
    indexedProfileTotal,
    results.length,
    trimmedQuery,
  ]);

  useEffect(() => {
    if (!active || totalProfiles != null || protocolPulseTotals != null) return;

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
        // The profile list still works without the protocol-wide total.
      });

    return () => controller.abort();
  }, [active, protocolPulseTotals, totalProfiles]);

  useEffect(() => {
    if (!active) {
      latestLoadRef.current += 1;
      return;
    }

    const controller = new AbortController();
    const loadId = latestLoadRef.current + 1;
    latestLoadRef.current = loadId;
    const timeout = window.setTimeout(
      () => {
        setIsLoading(true);
        setIsLoadingMore(false);
        setError(null);
        setHasMore(false);

        void fetchProfileDiscovery(query, viewerAccountId, 0, controller.signal)
          .then((response) => {
            if (latestLoadRef.current !== loadId) return;
            setResults(response.results);
            setHasMore(response.hasMore);
          })
          .catch((err) => {
            if (latestLoadRef.current !== loadId) return;
            if (controller.signal.aborted) return;
            setError(getErrorMessage(err));
            setResults([]);
            setHasMore(false);
          })
          .finally(() => {
            if (latestLoadRef.current === loadId) setIsLoading(false);
          });
      },
      query.trim() ? 220 : 0
    );

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [active, query, viewerAccountId]);

  const loadMoreAbortRef = useRef<AbortController | null>(null);

  const loadMore = useCallback(async () => {
    if (!active || isLoading || isLoadingMore || !hasMore) return;

    loadMoreAbortRef.current?.abort();
    const controller = new AbortController();
    loadMoreAbortRef.current = controller;

    const loadId = latestLoadRef.current;
    const offset = results.length;
    setIsLoadingMore(true);
    setError(null);

    try {
      const response = await fetchProfileDiscovery(
        query,
        viewerAccountId,
        offset,
        controller.signal
      );
      if (latestLoadRef.current !== loadId) return;
      setResults((current) => mergeDiscoverResults(current, response.results));
      setHasMore(response.hasMore);
    } catch (err) {
      if (latestLoadRef.current !== loadId) return;
      if (controller.signal.aborted) return;
      setError(getErrorMessage(err));
    } finally {
      if (latestLoadRef.current === loadId) setIsLoadingMore(false);
    }
  }, [
    active,
    hasMore,
    isLoading,
    isLoadingMore,
    query,
    results.length,
    viewerAccountId,
  ]);

  useEffect(() => {
    if (!active || !hasMore || isLoading || isLoadingMore) return;

    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;

    const root =
      scrollRootRef?.current ??
      (containedScroll ? internalScrollRef.current : null);

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { root, rootMargin: '160px', threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    active,
    hasMore,
    isLoading,
    isLoadingMore,
    loadMore,
    results.length,
    scrollRootRef,
    containedScroll,
  ]);

  const emptyLabel = useMemo(() => {
    if (isLoading) return 'Finding profiles...';
    if (trimmedQuery) return 'No matching profiles yet.';
    return 'No profiles found yet.';
  }, [isLoading, trimmedQuery]);

  const handleStanding = async (
    result: ProfileDiscoverResult,
    shouldStand: boolean
  ) => {
    if (!viewerAccountId || viewerAccountId === result.accountId) return;
    if (!onUpdateStanding || pendingStandingIds.has(result.accountId)) return;

    setError(null);
    setPendingStandingIds((prev) => new Set(prev).add(result.accountId));

    try {
      await onUpdateStanding(result.accountId, shouldStand);
      const now = Date.now();
      setResults((current) =>
        current.map((item) =>
          item.accountId === result.accountId
            ? {
                ...item,
                viewerStanding: shouldStand,
                standingSince: shouldStand ? (item.standingSince ?? now) : null,
                standingBlockTimestamp: shouldStand
                  ? (item.standingBlockTimestamp ?? now)
                  : null,
                standingCount: Math.max(
                  0,
                  item.standingCount +
                    (shouldStand === item.viewerStanding
                      ? 0
                      : shouldStand
                        ? 1
                        : -1)
                ),
              }
            : item
        )
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPendingStandingIds((prev) => {
        const next = new Set(prev);
        next.delete(result.accountId);
        return next;
      });
    }
  };

  if (!active) return null;

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {showSearch ? (
        <div className={cn('shrink-0', searchClassName)}>
          <SearchInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search names or accounts"
            size="sm"
            autoFocus={autoFocusSearch}
            maxLength={80}
            clearAriaLabel="Clear profile search"
          />
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-xl border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--portal-red)]">
          {error}
        </p>
      ) : null}

      <div
        ref={internalScrollRef}
        className={cn(
          containedScroll &&
            'min-h-0 flex-1 overflow-y-auto overscroll-contain',
          resultsClassName
        )}
      >
        <AnimatePresence initial={false}>
          {isLoading && results.length === 0 ? (
            <motion.div
              key="discover-loading"
              {...fadeMotion(reduceMotion ? 0 : 0.12)}
            >
              <ProfileListSkeletonRows variant="discovery" count={8} />
            </motion.div>
          ) : results.length > 0 ? (
            <motion.div
              key={`results-${query}`}
              {...fadeMotion(reduceMotion ? 0 : 0.14)}
              className={pageLayout ? 'space-y-1' : 'divide-y divide-fade-item'}
            >
              {results.map((result) => {
                const viewerStandsWithResult = Boolean(result.viewerStanding);
                const bio = profileBio(result);
                const canUpdateStanding =
                  Boolean(viewerAccountId) &&
                  viewerAccountId !== result.accountId &&
                  Boolean(onUpdateStanding);
                const isPending = pendingStandingIds.has(result.accountId);
                const canShowViewerRelationship =
                  Boolean(viewerAccountId) &&
                  viewerAccountId !== result.accountId;
                const theyStandWithViewer =
                  canShowViewerRelationship &&
                  Boolean(result.theyStandWithViewer);
                const sharedSolidarity =
                  viewerStandsWithResult && theyStandWithViewer;
                const showEndorsedYou =
                  canShowViewerRelationship &&
                  Boolean(result.targetEndorsedViewer);
                const timeMeta = viewerStandsWithResult
                  ? standingTimeMeta(result)
                  : null;

                return (
                  <motion.div
                    key={result.accountId}
                    initial={false}
                    className={discoveryResultRowClass}
                  >
                    <DiscoveryProfileTarget
                      accountId={result.accountId}
                      pageLayout={pageLayout}
                      onSelectAccount={onSelectAccount}
                    >
                      <ProfileAvatar
                        avatarUrl={result.avatarUrl}
                        className="mt-0.5 h-9 w-9 transition-shadow group-hover:ring-1 group-hover:ring-foreground/15"
                      />
                      <span className="min-w-0 flex-1">
                        {sharedSolidarity ||
                        theyStandWithViewer ||
                        showEndorsedYou ? (
                          <span className="mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            {sharedSolidarity ? (
                              <RelationshipSignal
                                label="Solidarity"
                                tone="purple"
                                title="You both stand with each other"
                              />
                            ) : theyStandWithViewer ? (
                              <RelationshipSignal
                                label="Stands with you"
                                tone="blue"
                                title="This account stands with you"
                              />
                            ) : null}
                            {showEndorsedYou ? (
                              <RelationshipSignal
                                label="Endorsed you"
                                tone="gold"
                                title="This account has endorsed you"
                              />
                            ) : null}
                          </span>
                        ) : null}
                        <span className="block truncate portal-type-lead font-medium text-foreground">
                          {displayName(result)}
                        </span>
                        <span className="block truncate portal-type-body-sm text-muted-foreground/55">
                          @{result.accountId}
                        </span>
                        {bio ? (
                          <span className="mt-0.5 block truncate portal-type-body-sm text-muted-foreground/60">
                            {bio}
                          </span>
                        ) : null}
                        <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 portal-type-label text-muted-foreground/65">
                          <PortalHoverTooltip
                            className="inline-flex items-center gap-1 whitespace-nowrap"
                            aria-label={`${formatCount(result.standingCount)} stand with them`}
                            stopPropagation
                            tooltip="Stand with them"
                          >
                            <ProtocolMotionArrow
                              static
                              className="h-2.5 w-2.5 text-[var(--portal-blue)]/55"
                            />
                            <span
                              className={cn(
                                'font-semibold tabular-nums text-[var(--portal-blue)]/85',
                                result.standingCount === 0 && 'opacity-40'
                              )}
                            >
                              {formatCount(result.standingCount)}
                            </span>
                          </PortalHoverTooltip>
                          <PortalHoverTooltip
                            className="inline-flex items-center gap-1 whitespace-nowrap"
                            aria-label={`They stand with ${formatCount(result.standingWithCount)}`}
                            stopPropagation
                            tooltip="They stand with"
                          >
                            <span
                              className={cn(
                                'font-semibold tabular-nums text-[var(--portal-blue)]/85',
                                result.standingWithCount === 0 && 'opacity-40'
                              )}
                            >
                              {formatCount(result.standingWithCount)}
                            </span>
                            <ProtocolMotionArrow
                              static
                              className="h-2.5 w-2.5 text-[var(--portal-blue)]/55"
                            />
                          </PortalHoverTooltip>
                          <span
                            className="text-muted-foreground/25"
                            aria-hidden="true"
                          >
                            ·
                          </span>
                          <PortalHoverTooltip
                            className="inline-flex items-center gap-1 whitespace-nowrap"
                            aria-label={`${formatCount(result.mutualStandingCount)} solidarity connections`}
                            stopPropagation
                            tooltip="Solidarity"
                          >
                            <ProtocolMotionArrow
                              direction="in"
                              static
                              className="h-2.5 w-2.5 text-[var(--portal-purple)]/65"
                            />
                            <span
                              className={cn(
                                'font-semibold tabular-nums text-[var(--portal-purple)]/85',
                                result.mutualStandingCount === 0 && 'opacity-40'
                              )}
                            >
                              {formatCount(result.mutualStandingCount)}
                            </span>
                            <ProtocolMotionArrow
                              static
                              className="h-2.5 w-2.5 text-[var(--portal-purple)]/65"
                            />
                          </PortalHoverTooltip>
                          <span
                            className="text-muted-foreground/25"
                            aria-hidden="true"
                          >
                            ·
                          </span>
                          <PortalHoverTooltip
                            className="inline-flex items-center gap-1 whitespace-nowrap"
                            aria-label={`${formatCount(result.endorsementsReceivedCount)} endorsements received`}
                            stopPropagation
                            tooltip="Endorsements received"
                          >
                            <ProtocolMotionArrow
                              static
                              className="h-2.5 w-2.5 text-[var(--portal-gold)]/65"
                            />
                            <span
                              className={cn(
                                'font-semibold tabular-nums text-[var(--portal-gold)]/85',
                                result.endorsementsReceivedCount === 0 &&
                                  'opacity-40'
                              )}
                            >
                              {formatCount(result.endorsementsReceivedCount)}
                            </span>
                          </PortalHoverTooltip>
                          <PortalHoverTooltip
                            className="inline-flex items-center gap-1 whitespace-nowrap"
                            aria-label={`${formatCount(result.endorsementsGivenCount)} endorsements given`}
                            stopPropagation
                            tooltip="Endorsements given"
                          >
                            <span
                              className={cn(
                                'font-semibold tabular-nums text-[var(--portal-gold)]/85',
                                result.endorsementsGivenCount === 0 &&
                                  'opacity-40'
                              )}
                            >
                              {formatCount(result.endorsementsGivenCount)}
                            </span>
                            <ProtocolMotionArrow
                              static
                              className="h-2.5 w-2.5 text-[var(--portal-gold)]/65"
                            />
                          </PortalHoverTooltip>
                        </span>
                      </span>
                    </DiscoveryProfileTarget>

                    {canUpdateStanding || timeMeta ? (
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <PortalHoverTooltip
                          className={cn(
                            'text-right portal-type-caption tabular-nums text-muted-foreground/50',
                            !timeMeta && 'invisible'
                          )}
                          aria-hidden={!timeMeta}
                          aria-label={timeMeta?.description}
                          stopPropagation
                          tooltip={timeMeta?.description}
                        >
                          {timeMeta?.label || '0d ago'}
                        </PortalHoverTooltip>
                        {canUpdateStanding ? (
                          isPending ? (
                            <span
                              className={cn(
                                'shrink-0',
                                profileSocialStandingButtonClass(
                                  viewerStandsWithResult
                                )
                              )}
                              aria-label={
                                viewerStandsWithResult
                                  ? 'Stepping back'
                                  : 'Standing'
                              }
                            >
                              <ProfileSocialStandingPending
                                active={viewerStandsWithResult}
                                hasSocialSession={hasSocialSession}
                              />
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={(event) => {
                                event.stopPropagation();
                                event.preventDefault();
                                void handleStanding(
                                  result,
                                  !viewerStandsWithResult
                                );
                              }}
                              className={cn(
                                'shrink-0',
                                profileSocialStandingButtonClass(
                                  viewerStandsWithResult
                                )
                              )}
                              aria-label={
                                viewerStandsWithResult
                                  ? `Step back from ${displayName(result)}`
                                  : hasSocialSession
                                    ? `Stand with ${displayName(result)}`
                                    : `Authorize and stand with ${displayName(result)}`
                              }
                            >
                              <ProfileSocialStandingToggle
                                active={viewerStandsWithResult}
                                hasSocialSession={hasSocialSession}
                              />
                            </button>
                          )
                        ) : null}
                      </span>
                    ) : null}
                  </motion.div>
                );
              })}
              <ProfileListLoadMoreFooter
                loadMoreSentinelRef={loadMoreSentinelRef}
                resultsSummary={resultsSummary}
                isLoadingMore={isLoadingMore}
                skeletonVariant="discovery"
                className="py-3"
              />
            </motion.div>
          ) : (
            <motion.div
              key={`empty-${emptyLabel}`}
              {...fadeMotion(reduceMotion ? 0 : 0.14)}
              className="px-3 py-6 text-center text-sm text-muted-foreground/65"
            >
              {emptyLabel}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
export function formatDiscoveryProfileTotal(
  discoverableTotal: number | null | undefined,
  indexedTotal?: number | null | undefined
): string | undefined {
  const discoverable =
    typeof discoverableTotal === 'number' && discoverableTotal > 0
      ? discoverableTotal
      : null;
  const indexed =
    typeof indexedTotal === 'number' && indexedTotal > 0 ? indexedTotal : null;

  if (!discoverable && !indexed) return undefined;
  if (discoverable && indexed && indexed > discoverable) {
    return `${formatCount(discoverable)} discoverable · ${formatCount(indexed)} indexed on the graph`;
  }
  if (discoverable) {
    return `${formatCount(discoverable)} discoverable profiles`;
  }
  return `${formatCount(indexed!)} profiles on the graph`;
}
