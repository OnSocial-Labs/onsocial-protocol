'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { User, UserMinus, UserPlus, X } from 'lucide-react';
import type { MaterialisedProfile } from '@onsocial/sdk';
import { portalElevatedShadowClass } from '@/components/ui/floating-panel';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface ProfileDiscoverResult {
  accountId: string;
  profile: MaterialisedProfile | null;
  avatarUrl: string | null;
  standingCount: number;
  standingWithCount: number;
  viewerStanding: boolean;
}

interface ProfileDiscoverResponse {
  query: string;
  results: ProfileDiscoverResult[];
}

interface ProfileDiscoveryModalProps {
  open: boolean;
  viewerAccountId: string | null;
  onOpenChange: (open: boolean) => void;
  onSelectAccount: (accountId: string) => void;
  onUpdateStanding?: (
    accountId: string,
    shouldStand: boolean
  ) => Promise<unknown>;
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

function formatCount(count: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact' }).format(count);
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
  onOpenChange,
  onSelectAccount,
  onUpdateStanding,
}: ProfileDiscoveryModalProps) {
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileDiscoverResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingStandingAccountId, setPendingStandingAccountId] = useState<
    string | null
  >(null);
  const latestLoadRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const title = query.trim() ? 'Profile search' : 'Discover profiles';
  useBodyScrollLock(open, scrollRef);

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
    if (query.trim()) return 'No matching profiles yet.';
    return 'No profiles found yet.';
  }, [isLoading, query]);

  const handleStanding = async (
    result: ProfileDiscoverResult,
    shouldStand: boolean
  ) => {
    if (!viewerAccountId || viewerAccountId === result.accountId) return;
    if (!onUpdateStanding || pendingStandingAccountId) return;

    setError(null);
    setPendingStandingAccountId(result.accountId);

    try {
      await onUpdateStanding(result.accountId, shouldStand);
      setResults((current) =>
        current.map((item) =>
          item.accountId === result.accountId
            ? {
                ...item,
                viewerStanding: shouldStand,
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
      setPendingStandingAccountId(null);
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
            <div className="shrink-0 space-y-4 px-4 py-5 md:px-5">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="absolute right-3 top-3 z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/45 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                aria-label="Close profile discovery"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="min-w-0 pr-10">
                <h2
                  id="profile-discovery-title"
                  className="truncate text-xl font-semibold text-foreground"
                >
                  {title}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground/60">
                  Find anyone on OnSocial.
                </p>
              </div>

              <SearchInput
                value={query}
                onValueChange={setQuery}
                placeholder="Search names or accounts"
                size="lg"
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
                    className="space-y-1.5"
                  >
                    {results.map((result) => {
                      const viewerStandsWithResult = Boolean(
                        result.viewerStanding
                      );
                      const canUpdateStanding =
                        Boolean(viewerAccountId) &&
                        viewerAccountId !== result.accountId &&
                        Boolean(onUpdateStanding);
                      const isPending =
                        pendingStandingAccountId === result.accountId;

                      return (
                        <motion.div
                          key={result.accountId}
                          initial={false}
                          className="group flex w-full min-w-0 items-center gap-3 rounded-xl border border-transparent px-2.5 py-2.5 text-left transition-colors hover:bg-[var(--portal-slate-bg)] hover:text-foreground"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onOpenChange(false);
                              onSelectAccount(result.accountId);
                            }}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--portal-blue-focus-border)]"
                          >
                            <ProfileAvatar
                              avatarUrl={result.avatarUrl}
                              className="h-9 w-9"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium text-foreground">
                                {displayName(result)}
                              </span>
                              <span className="block truncate text-[11px] text-muted-foreground/55">
                                {result.accountId}
                              </span>
                              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground/70">
                                <span>
                                  {formatCount(result.standingCount)} stand with
                                  them
                                </span>
                                <span>
                                  They stand with{' '}
                                  {formatCount(result.standingWithCount)}
                                </span>
                              </span>
                            </span>
                          </button>

                          {canUpdateStanding ? (
                            isPending ? (
                              <span
                                className={cn(
                                  'flex h-7 min-w-[80px] shrink-0 items-center justify-center rounded-full',
                                  viewerStandsWithResult
                                    ? 'border border-border/50 bg-transparent text-muted-foreground'
                                    : 'border portal-green-surface'
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
                                disabled={Boolean(pendingStandingAccountId)}
                                onClick={() =>
                                  handleStanding(
                                    result,
                                    !viewerStandsWithResult
                                  )
                                }
                                className={cn(
                                  'inline-flex h-7 min-w-[80px] shrink-0 items-center justify-center gap-1 rounded-full border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50',
                                  viewerStandsWithResult
                                    ? 'border-border/50 bg-transparent text-muted-foreground hover:border-border hover:text-foreground focus-visible:ring-border/50'
                                    : 'portal-green-surface focus-visible:ring-[var(--portal-green-border)]'
                                )}
                                aria-label={
                                  viewerStandsWithResult
                                    ? `Step back from ${displayName(result)}`
                                    : `Stand with ${displayName(result)}`
                                }
                              >
                                {viewerStandsWithResult ? (
                                  <>
                                    <UserMinus className="h-3 w-3" />
                                    Step back
                                  </>
                                ) : (
                                  <>
                                    <UserPlus className="h-3 w-3" />
                                    Stand
                                  </>
                                )}
                              </button>
                            )
                          ) : null}
                        </motion.div>
                      );
                    })}
                  </motion.div>
                ) : (
                  <motion.div
                    key={`empty-${emptyLabel}`}
                    {...fadeMotion(reduceMotion ? 0 : 0.14)}
                    className="rounded-xl border border-border/45 bg-muted/18 px-3 py-6 text-center text-sm text-muted-foreground"
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
