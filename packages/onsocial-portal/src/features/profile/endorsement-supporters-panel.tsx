'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { EndorsementSupportContextCard } from '@/components/endorsement-support-context-card';
import { EndorsementSupportersList } from '@/features/profile/endorsement-supporters-list';
import { ProfileListSearchBar } from '@/features/profile/profile-list-search-bar';
import { ProfileListSkeletonRows } from '@/features/profile/profile-list-loading';
import { humanizeEndorsementTopic } from '@/lib/endorsements';
import { fadeMotion } from '@/lib/motion';
import { syncPortalEndorsementSupportersUrl } from '@/lib/portal-config';
import {
  normalizeProfileSearchQuery,
  PROFILE_SEARCH_MIN_QUERY_LENGTH,
} from '@/lib/profile-account-search';
import { formatProfileCount } from '@/lib/profile-social-standings';
import {
  fetchEndorsementSupportContext,
  fetchEndorsementSupporters,
  type EndorsementSupporterSummary,
  type EndorsementSupportContext,
} from '@/lib/social-spend-endorsement';
import { stickyRailShadowClass } from '@/lib/profile-page-layout';
import { useNavStickyTop } from '@/hooks/use-nav-sticky-top';
import { cn } from '@/lib/utils';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Could not load supporters.';
}

export function EndorsementSupportersPanel({
  pageAccountId,
  endorsementId,
  issuer,
  target,
  topic,
  initialQuery = '',
  syncUrl = false,
  viewerAccountId,
}: {
  pageAccountId: string;
  endorsementId: string;
  issuer?: string | null;
  target?: string | null;
  topic?: string | null;
  initialQuery?: string;
  syncUrl?: boolean;
  viewerAccountId: string | null;
}) {
  const reduceMotion = useReducedMotion();
  const stickyTop = useNavStickyTop();
  const [query, setQuery] = useState(initialQuery);
  const [context, setContext] = useState<EndorsementSupportContext | null>(
    null
  );
  const [contextError, setContextError] = useState<string | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [supporters, setSupporters] = useState<EndorsementSupporterSummary[]>(
    []
  );
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const topicLabel = humanizeEndorsementTopic(topic ?? undefined) || 'General';
  const normalizedQuery = normalizeProfileSearchQuery(query);
  const serverSearchActive =
    normalizedQuery.length >= PROFILE_SEARCH_MIN_QUERY_LENGTH;
  const searchQueryForFetch = serverSearchActive ? normalizedQuery : '';

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (!syncUrl) return;
    syncPortalEndorsementSupportersUrl(pageAccountId, {
      endorsementId,
      issuer,
      target,
      topic,
      q: serverSearchActive ? normalizedQuery : null,
    });
  }, [
    endorsementId,
    issuer,
    normalizedQuery,
    pageAccountId,
    serverSearchActive,
    syncUrl,
    target,
    topic,
  ]);

  useEffect(() => {
    let cancelled = false;
    setContextLoading(true);
    setContextError(null);

    void fetchEndorsementSupportContext(endorsementId, {
      issuer,
      target,
      topic,
    })
      .then((response) => {
        if (!cancelled) setContext(response);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setContextError(getErrorMessage(error));
          setContext(null);
        }
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [endorsementId, issuer, target, topic]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    void fetchEndorsementSupporters(endorsementId, {
      viewerAccountId,
      q: searchQueryForFetch || undefined,
    })
      .then((response) => {
        if (!cancelled) {
          setSupporters(response.supporters);
          setTotal(response.total);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(error));
          setSupporters([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [endorsementId, searchQueryForFetch, viewerAccountId]);

  const filteredSupporters = useMemo(() => {
    if (serverSearchActive) return supporters;
    const needle = query.trim().toLowerCase();
    if (!needle) return supporters;
    return supporters.filter((account) => {
      const label = (account.name?.trim() || account.accountId).toLowerCase();
      const accountIdLabel = account.accountId.toLowerCase();
      const bio = account.bio?.toLowerCase() ?? '';
      return (
        label.includes(needle) ||
        accountIdLabel.includes(needle) ||
        bio.includes(needle)
      );
    });
  }, [query, serverSearchActive, supporters]);

  const resultsSummary = useMemo(() => {
    if (isLoading) return null;
    const shown = formatProfileCount(filteredSupporters.length);
    if (serverSearchActive) {
      return filteredSupporters.length === total
        ? `${formatProfileCount(total)} matching supporter${total === 1 ? '' : 's'}`
        : `Showing ${shown} matching supporter${filteredSupporters.length === 1 ? '' : 's'}`;
    }
    if (query.trim()) {
      return `${shown} matching supporter${filteredSupporters.length === 1 ? '' : 's'}`;
    }
    return `${formatProfileCount(total)} supporter${total === 1 ? '' : 's'}`;
  }, [filteredSupporters.length, isLoading, query, serverSearchActive, total]);

  const emptyLabel = query.trim()
    ? 'No matching supporters.'
    : 'No supporters yet.';

  const resolvedContext = context ?? {
    endorsementId,
    totalAmountYocto: '0',
    supporterCount: total,
    issuer: issuer?.trim() ?? '',
    target: target?.trim() ?? '',
    topic: topic ?? null,
    note: null,
    issuerName: null,
    targetName: null,
    issuerAvatarUrl: null,
    targetAvatarUrl: null,
    previewSupporters: [],
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          'sticky z-20 mb-1 transition-[top] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          stickyRailShadowClass
        )}
        style={{ top: stickyTop }}
      >
        <div className="mb-3 min-w-0">
          <h1 className="portal-type-lead font-semibold tracking-tight text-foreground">
            Supporters
          </h1>
          <p className="mt-0.5 portal-type-body-sm text-muted-foreground/75">
            {topicLabel}
            {!isLoading && total > 0 ? (
              <span className="tabular-nums text-muted-foreground/55">
                {' '}
                · {formatProfileCount(total)}
              </span>
            ) : null}
          </p>
        </div>

        {contextLoading ? (
          <ProfileListSkeletonRows variant="endorsement" count={1} />
        ) : contextError ? (
          <p className="rounded-xl border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--portal-red)]">
            {contextError}
          </p>
        ) : (
          <EndorsementSupportContextCard context={resolvedContext} />
        )}

        <div className="mt-4">
          <ProfileListSearchBar
            query={query}
            onQueryChange={setQuery}
            placeholder="Search supporters"
            clearAriaLabel="Clear supporters search"
            embedded
          />
        </div>
      </div>

      {loadError ? (
        <p className="rounded-xl border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--portal-red)]">
          {loadError}
        </p>
      ) : null}

      <AnimatePresence initial={false} mode="wait">
        {isLoading ? (
          <motion.div
            key="supporters-loading"
            {...fadeMotion(reduceMotion ? 0 : 0.12)}
          >
            <ProfileListSkeletonRows variant="profile" count={6} />
          </motion.div>
        ) : filteredSupporters.length === 0 ? (
          <motion.p
            key="supporters-empty"
            {...fadeMotion(reduceMotion ? 0 : 0.12)}
            className="px-3 py-8 text-center text-sm text-muted-foreground/70"
          >
            {emptyLabel}
          </motion.p>
        ) : (
          <motion.div
            key="supporters-loaded"
            {...fadeMotion(reduceMotion ? 0 : 0.14)}
          >
            <EndorsementSupportersList supporters={filteredSupporters} />
          </motion.div>
        )}
      </AnimatePresence>

      {resultsSummary && !isLoading && filteredSupporters.length > 0 ? (
        <p className="px-1 text-center portal-type-caption text-muted-foreground/55">
          {resultsSummary}
        </p>
      ) : null}
    </div>
  );
}
