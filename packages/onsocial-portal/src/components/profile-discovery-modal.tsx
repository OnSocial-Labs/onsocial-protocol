'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Loader2, Search, User, Users, X } from 'lucide-react';
import type { MaterialisedProfile } from '@onsocial/sdk';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface ProfileDiscoverResult {
  accountId: string;
  profile: MaterialisedProfile | null;
  avatarUrl: string | null;
  standingCount: number;
  standingWithCount: number;
}

interface ProfileDiscoverResponse {
  query: string;
  results: ProfileDiscoverResult[];
}

interface ProfileDiscoveryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectAccount: (accountId: string) => void;
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
  query: string
): Promise<ProfileDiscoverResponse> {
  const search = new URLSearchParams({ limit: '12' });
  if (query.trim()) search.set('q', query.trim());

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
    results: body?.results ?? [],
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

export function ProfileDiscoveryModal({
  open,
  onOpenChange,
  onSelectAccount,
}: ProfileDiscoveryModalProps) {
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileDiscoverResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestLoadRef = useRef(0);
  const title = query.trim() ? 'Profile Search' : 'Discover Profiles';

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

        void fetchProfileDiscovery(query)
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
  }, [open, query]);

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

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          {...fadeMotion(reduceMotion ? 0 : 0.18)}
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
            className="relative max-h-[min(720px,calc(100vh-2rem))] w-full max-w-xl overflow-hidden rounded-2xl border border-border/67 bg-background/98 shadow-[0_26px_90px_-34px_rgba(15,23,42,0.72)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-fade-section px-4 py-4 md:px-5">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/60">
                  OnSocial
                </p>
                <h2
                  id="profile-discovery-title"
                  className="mt-1 truncate text-lg font-semibold text-foreground"
                >
                  {title}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/45 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                aria-label="Close profile discovery"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-4 py-5 md:px-5">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/55" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  autoFocus
                  maxLength={80}
                  placeholder="Search names or accounts"
                  className="h-11 w-full rounded-xl border border-border/50 bg-background/55 pl-9 pr-10 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-border"
                />
                {isLoading ? (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground/55" />
                ) : null}
              </label>

              {error ? (
                <p className="rounded-xl border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--portal-red)]">
                  {error}
                </p>
              ) : null}

              <div className="max-h-[calc(100vh-17rem)] space-y-1.5 overflow-y-auto pr-1">
                {results.length > 0 ? (
                  results.map((result) => (
                    <button
                      key={result.accountId}
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        onSelectAccount(result.accountId);
                      }}
                      className="group flex w-full min-w-0 items-center gap-3 rounded-xl border border-transparent px-2.5 py-2.5 text-left transition-colors hover:border-border/45 hover:bg-muted/24 focus-visible:border-border/70 focus-visible:outline-none"
                    >
                      <ProfileAvatar
                        avatarUrl={result.avatarUrl}
                        className="h-11 w-11"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {displayName(result)}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground/55">
                          {result.accountId}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground/70">
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {formatCount(result.standingCount)} standing
                          </span>
                          <span>
                            {formatCount(result.standingWithCount)} standing
                            with
                          </span>
                        </span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/35 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                    </button>
                  ))
                ) : (
                  <div className="rounded-xl border border-border/45 bg-muted/18 px-3 py-6 text-center text-sm text-muted-foreground">
                    {emptyLabel}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
