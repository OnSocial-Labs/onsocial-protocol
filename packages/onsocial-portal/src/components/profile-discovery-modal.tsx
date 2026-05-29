'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { User } from 'lucide-react';
import type { MaterialisedProfile } from '@onsocial/sdk';
import { portalElevatedShadowClass } from '@/components/ui/floating-panel';
import { ModalCloseButton } from '@/components/ui/modal-close-button';
import { ModalHeader } from '@/components/ui/modal-header';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import { profileActionButtonClass } from '@/components/ui/profile-action-pill';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { RelationshipSignal } from '@/components/ui/relationship-signal';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import { ACTIVE_API_URL } from '@/lib/portal-config';
import { cn } from '@/lib/utils';

interface ProfileDiscoverResult {
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
  results: ProfileDiscoverResult[];
}

interface ProtocolPulseResponse {
  totals?: {
    profiles?: number;
  };
}

interface ProfileDiscoveryModalProps {
  open: boolean;
  viewerAccountId: string | null;
  hasSocialSession?: boolean;
  totalProfiles?: number | null;
  onOpenChange: (open: boolean) => void;
  onSelectAccount: (accountId: string) => void;
  onUpdateStanding?: (
    accountId: string,
    shouldStand: boolean
  ) => Promise<unknown>;
  onEndorse?: (
    target: string,
    input: import('@onsocial/sdk').EndorsementBuildInput
  ) => Promise<unknown>;
  onRemoveEndorsement?: (target: string, topic?: string) => Promise<unknown>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Profile discovery failed';
}

function cleanHandle(accountId: string): string {
  return accountId.replace(/\.(testnet|near)$/u, '');
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
      Math.abs(numericCount) >= 1000 && Math.abs(numericCount) < 100000
        ? 1
        : 0,
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

async function fetchProfileDiscovery(
  query: string,
  viewerAccountId: string | null
): Promise<ProfileDiscoverResponse> {
  const search = new URLSearchParams({ limit: '12' });
  if (query.trim()) search.set('q', query.trim());
  if (viewerAccountId) search.set('viewerAccountId', viewerAccountId);

  const response = await fetch(`/api/profile/discover?${search.toString()}`, {
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => null)) as
    | (Partial<ProfileDiscoverResponse> & { error?: string; detail?: string })
    | null;

  if (!response.ok) {
    throw new Error(
      body?.detail ??
        body?.error ??
        `Profile discovery failed (${response.status})`
    );
  }

  return {
    query: body?.query ?? query,
    results: (body?.results ?? []).map((result) => ({
      ...result,
      viewerStanding: Boolean(result.viewerStanding),
      theyStandWithViewer: Boolean(result.theyStandWithViewer),
      targetEndorsedViewer: Boolean(result.targetEndorsedViewer),
    })),
  };
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

function DiscoveryResultsSkeleton() {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-xl px-2.5 py-2.5"
        >
          <Skeleton className="h-9 w-9 shrink-0 rounded-full bg-foreground/[0.08]" />
          <span className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-36 max-w-full bg-foreground/[0.08]" />
            <Skeleton className="h-3 w-48 max-w-full bg-foreground/5" />
            <Skeleton className="h-3 w-40 max-w-full bg-foreground/5" />
          </span>
          <Skeleton className="h-7 w-20 shrink-0 rounded-full bg-foreground/[0.08]" />
        </div>
      ))}
    </div>
  );
}

export function ProfileDiscoveryModal({
  open,
  viewerAccountId,
  hasSocialSession = false,
  totalProfiles = null,
  onOpenChange,
  onSelectAccount,
  onUpdateStanding,
}: ProfileDiscoveryModalProps) {
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileDiscoverResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [protocolProfileTotal, setProtocolProfileTotal] = useState<
    number | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingStandingIds, setPendingStandingIds] = useState<Set<string>>(
    () => new Set()
  );
  const latestLoadRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const trimmedQuery = query.trim();
  const profileTotal = totalProfiles ?? protocolProfileTotal;
  const discoveryMeta =
    typeof profileTotal === 'number' && profileTotal > 0
      ? `${formatCount(profileTotal)} IDENTITIES ON THE GRAPH`
      : undefined;
  useBodyScrollLock(open, scrollRef);

  useEffect(() => {
    if (!open || totalProfiles != null || protocolProfileTotal != null) return;

    const controller = new AbortController();
    fetch(`${ACTIVE_API_URL}/graph/protocol-pulse`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: ProtocolPulseResponse | null) => {
        const count = data?.totals?.profiles;
        if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
          setProtocolProfileTotal(count);
        }
      })
      .catch(() => {
        // The profile list still works without the protocol-wide total.
      });

    return () => controller.abort();
  }, [open, protocolProfileTotal, totalProfiles]);

  useEffect(() => {
    if (!open) {
      latestLoadRef.current += 1;
      return;
    }

    const loadId = latestLoadRef.current + 1;
    latestLoadRef.current = loadId;
    const timeout = window.setTimeout(
      () => {
        setIsLoading(true);
        setError(null);

        void fetchProfileDiscovery(query, viewerAccountId)
          .then((response) => {
            if (latestLoadRef.current !== loadId) return;
            setResults(response.results);
          })
          .catch((err) => {
            if (latestLoadRef.current !== loadId) return;
            setError(getErrorMessage(err));
            setResults([]);
          })
          .finally(() => {
            if (latestLoadRef.current === loadId) setIsLoading(false);
          });
      },
      query.trim() ? 220 : 0
    );

    return () => window.clearTimeout(timeout);
  }, [open, query, viewerAccountId]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenChange, open]);

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
                standingSince: shouldStand
                  ? (item.standingSince ?? now)
                  : null,
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

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          {...fadeMotion(reduceMotion ? 0 : 0.18)}
          data-lenis-prevent
          className="fixed inset-0 z-[2147483644] flex items-center justify-center px-4 py-6"
        >
          <button
            type="button"
            className="absolute inset-0 bg-background/72 backdrop-blur-md"
            aria-label="Close profile discovery"
            onClick={() => onOpenChange(false)}
          />

          <motion.div
            {...scaleFadeMotion(!!reduceMotion, {
              y: 16,
              scale: 0.98,
              duration: 0.22,
              exitY: 10,
              exitScale: 0.99,
            })}
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-discovery-title"
            className={cn(
              'relative flex h-[min(720px,calc(100vh-2rem))] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border/67 bg-background/98',
              portalElevatedShadowClass
            )}
          >
            <ModalHeader
              titleId="profile-discovery-title"
              title="Discover profiles"
              description={discoveryMeta}
              descriptionVariant="meta"
              actions={
                <ModalCloseButton
                  ariaLabel="Close profile discovery"
                  onClick={() => onOpenChange(false)}
                />
              }
            />

            <div className="shrink-0 px-4 pb-4 md:px-5">
              <SearchInput
                value={query}
                onValueChange={setQuery}
                placeholder="Search names or accounts"
                size="sm"
                autoFocus
                maxLength={80}
                clearAriaLabel="Clear profile search"
              />
            </div>

            {error ? (
              <p className="mx-4 mb-3 rounded-xl border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--portal-red)] md:mx-5">
                {error}
              </p>
            ) : null}

            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 md:px-5"
            >
              <AnimatePresence initial={false}>
                {isLoading && results.length === 0 ? (
                  <motion.div
                    key="discover-loading"
                    {...fadeMotion(reduceMotion ? 0 : 0.12)}
                  >
                    <DiscoveryResultsSkeleton />
                  </motion.div>
                ) : results.length > 0 ? (
                  <motion.div
                    key={`results-${query}`}
                    {...fadeMotion(reduceMotion ? 0 : 0.14)}
                    className="divide-y divide-fade-item"
                  >
                    {results.map((result) => {
                      const viewerStandsWithResult = Boolean(
                        result.viewerStanding
                      );
                      const bio = profileBio(result);
                      const canUpdateStanding =
                        Boolean(viewerAccountId) &&
                        viewerAccountId !== result.accountId &&
                        Boolean(onUpdateStanding);
                      const isPending =
                        pendingStandingIds.has(result.accountId);
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
                          className="flex w-full min-w-0 items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-[var(--portal-slate-bg)] focus-within:bg-[var(--portal-slate-bg)]"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onOpenChange(false);
                              onSelectAccount(result.accountId);
                            }}
                            className="group flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left focus-visible:outline-none"
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
                              <span className="block truncate text-[13px] font-medium text-foreground">
                                {displayName(result)}
                              </span>
                              <span className="block truncate text-[11px] text-muted-foreground/55">
                                @{result.accountId}
                              </span>
                              {bio ? (
                                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/60">
                                  {bio}
                                </span>
                              ) : null}
                              <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground/65">
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
                                      result.standingCount === 0 &&
                                        'opacity-40'
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
                                      result.standingWithCount === 0 &&
                                        'opacity-40'
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
                                    className="h-2 w-2 text-[var(--portal-purple)]/65"
                                  />
                                  <span
                                    className={cn(
                                      'font-semibold tabular-nums text-[var(--portal-purple)]/85',
                                      result.mutualStandingCount === 0 &&
                                        'opacity-40'
                                    )}
                                  >
                                    {formatCount(result.mutualStandingCount)}
                                  </span>
                                  <ProtocolMotionArrow
                                    static
                                    className="h-2 w-2 text-[var(--portal-purple)]/65"
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
                                  aria-label={`${formatCount(result.endorsementsReceivedCount)} endorsements received and ${formatCount(result.endorsementsGivenCount)} given`}
                                  stopPropagation
                                  tooltip="Endorsements"
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
                                    {formatCount(
                                      result.endorsementsReceivedCount
                                    )}
                                  </span>
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
                          </button>

                          {canUpdateStanding || timeMeta ? (
                            <span className="flex shrink-0 flex-col items-end gap-1">
                              <PortalHoverTooltip
                                className={cn(
                                  'text-right text-[10px] tabular-nums text-muted-foreground/50',
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
                                      profileActionButtonClass(
                                        viewerStandsWithResult
                                          ? 'slate'
                                          : 'blue'
                                      )
                                    )}
                                    aria-label={
                                      viewerStandsWithResult
                                        ? 'Stepping back'
                                        : 'Standing'
                                    }
                                  >
                                    <PulsingDots size="sm" />
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={isPending}
                                    onClick={() =>
                                      handleStanding(
                                        result,
                                        !viewerStandsWithResult
                                      )
                                    }
                                    className={cn(
                                      'shrink-0',
                                      profileActionButtonClass(
                                        viewerStandsWithResult
                                          ? 'slate'
                                          : 'blue'
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
                                    {viewerStandsWithResult ? (
                                      <>
                                        <span className="inline-flex items-center gap-1 group-hover:hidden group-focus-visible:hidden">
                                          <ProtocolMotionArrow className="h-2.5 w-2.5 text-[var(--portal-blue)]/50" />
                                          Standing
                                        </span>
                                        <span className="hidden items-center gap-1 group-hover:inline-flex group-focus-visible:inline-flex">
                                          <ProtocolMotionArrow direction="left" className="h-2.5 w-2.5" />
                                          Step back
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <ProtocolMotionArrow className="h-2.5 w-2.5" />
                                        {hasSocialSession
                                          ? 'Stand with'
                                          : 'Authorize & stand'}
                                      </>
                                    )}
                                  </button>
                                )
                              ) : null}
                            </span>
                          ) : null}
                        </motion.div>
                      );
                    })}
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
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
