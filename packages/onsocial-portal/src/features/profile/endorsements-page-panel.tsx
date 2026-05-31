'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PenLine } from 'lucide-react';
import {
  EndorsementRecord,
  endorsementListRowClass,
} from '@/components/ui/endorsement-flow';
import { profileSocialStandingButtonClass } from '@/components/ui/profile-action-pill';
import {
  ProfileListLoadMoreFooter,
  ProfileListSkeletonRows,
  ProfileViewAllButton,
} from '@/features/profile/profile-list-loading';
import {
  buildEndorsementViewOptions,
  ProfileListFilterRail,
} from '@/features/profile/profile-list-filter-rail';
import { EndorseModal } from '@/components/endorse-modal';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import { PROFILE_SEARCH_MIN_QUERY_LENGTH } from '@/lib/profile-account-search';
import {
  cleanHandle,
  endorsementTimestamp,
  formatEndorsementTime,
  humanizeEndorsementTopic,
  mergeEndorsementsAfterUpsert,
  normalizeEndorsementTopic,
  topTopics,
  type EndorsementSubmitInput,
} from '@/lib/endorsements';
import type { EndorsementListItem } from '@onsocial/sdk';
import type { PortalEndorsementsMode } from '@/lib/portal-config';
import { cn } from '@/lib/utils';

export type EnrichedEndorsementListItem = EndorsementListItem & {
  issuerName?: string | null;
  issuerAvatarUrl?: string | null;
  targetName?: string | null;
  targetAvatarUrl?: string | null;
};

interface EndorsementsPageResponse {
  accountId: string;
  mode: PortalEndorsementsMode;
  limit: number;
  offset: number;
  hasMore: boolean;
  total: number;
  endorsements: EnrichedEndorsementListItem[];
}

const ENDORSEMENT_PAGE_SIZE = 24;

export interface EndorsementFocusParams {
  issuer?: string | null;
  target?: string | null;
  topic?: string | null;
}

function isSameEndorsement(
  a: EnrichedEndorsementListItem,
  b: EnrichedEndorsementListItem
): boolean {
  return (
    a.issuer === b.issuer &&
    normalizeEndorsementTopic(a.topic ?? '').toLowerCase() ===
      normalizeEndorsementTopic(b.topic ?? '').toLowerCase()
  );
}

function mergeEndorsementPages(
  current: EnrichedEndorsementListItem[],
  incoming: EnrichedEndorsementListItem[]
): EnrichedEndorsementListItem[] {
  if (incoming.length === 0) return current;

  const seen = new Set(
    current.map((item) => `${item.issuer}:${item.target}:${item.topic ?? ''}`)
  );
  const merged = [...current];
  for (const item of incoming) {
    const key = `${item.issuer}:${item.target}:${item.topic ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

async function fetchEndorsementsPage(
  accountId: string,
  mode: PortalEndorsementsMode,
  offset: number,
  q = ''
): Promise<EndorsementsPageResponse> {
  const search = new URLSearchParams({
    accountId,
    mode,
    limit: String(ENDORSEMENT_PAGE_SIZE),
    offset: String(offset),
  });
  const normalizedQuery = q.trim();
  if (normalizedQuery.length >= PROFILE_SEARCH_MIN_QUERY_LENGTH) {
    search.set('q', normalizedQuery);
  }

  const response = await fetch(
    `/api/profile/endorsements?${search.toString()}`,
    { cache: 'no-store' }
  );
  const body = (await response.json().catch(() => null)) as
    | (Partial<EndorsementsPageResponse> & { error?: string; detail?: string })
    | null;

  if (!response.ok) {
    throw new Error(
      body?.detail ??
        body?.error ??
        `Endorsements query failed (${response.status})`
    );
  }

  return {
    accountId,
    mode,
    limit: body?.limit ?? ENDORSEMENT_PAGE_SIZE,
    offset: body?.offset ?? offset,
    hasMore: Boolean(body?.hasMore),
    total: Number(body?.total ?? 0),
    endorsements: body?.endorsements ?? [],
  };
}

export function EndorsementsPagePanel({
  targetAccountId,
  targetDisplayName,
  targetAvatarUrl = null,
  mode,
  isSelf,
  metaLoaded = true,
  viewerAccountId,
  viewerAvatarUrl = null,
  hasSocialSession = false,
  initialTopic = null,
  initialFocus = null,
  canEndorse = false,
  isSavingEndorsement = false,
  endorsementCounts = null,
  onSelectAccount,
  onEndorse,
  onRemoveEndorsement,
}: {
  targetAccountId: string;
  targetDisplayName: string;
  targetAvatarUrl?: string | null;
  mode: PortalEndorsementsMode;
  isSelf: boolean;
  metaLoaded?: boolean;
  viewerAccountId: string | null;
  viewerAvatarUrl?: string | null;
  hasSocialSession?: boolean;
  initialTopic?: string | null;
  initialFocus?: EndorsementFocusParams | null;
  canEndorse?: boolean;
  isSavingEndorsement?: boolean;
  endorsementCounts?: { received: number; given: number } | null;
  onSelectAccount?: (accountId: string) => void;
  onEndorse?: (
    targetAccountId: string,
    input: EndorsementSubmitInput
  ) => Promise<unknown>;
  onRemoveEndorsement?: (
    targetAccountId: string,
    topic?: string
  ) => Promise<unknown>;
}) {
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const latestLoadRef = useRef(0);
  const [query, setQuery] = useState('');
  const [activeTopic, setActiveTopic] = useState<string | null>(
    initialTopic ?? null
  );
  const [items, setItems] = useState<EnrichedEndorsementListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [focusedEndorsement, setFocusedEndorsement] =
    useState<EnrichedEndorsementListItem | null>(null);
  const [endorseOpen, setEndorseOpen] = useState(false);
  const [editingFromList, setEditingFromList] =
    useState<EnrichedEndorsementListItem | null>(null);

  const serverSearchActive =
    query.trim().length >= PROFILE_SEARCH_MIN_QUERY_LENGTH;
  const searchQueryForFetch = serverSearchActive ? query.trim() : '';

  useEffect(() => {
    setActiveTopic(initialTopic ?? null);
    setFocusedEndorsement(null);
    setQuery('');
  }, [initialTopic, mode, targetAccountId]);

  useEffect(() => {
    if (!initialFocus?.issuer) return;
    setFocusedEndorsement({
      issuer: initialFocus.issuer,
      target: initialFocus.target ?? targetAccountId,
      topic: initialFocus.topic ?? undefined,
      v: 1,
      since: 0,
      blockHeight: 0,
      blockTimestamp: 0,
    });
  }, [initialFocus, targetAccountId]);

  useEffect(() => {
    const loadId = latestLoadRef.current + 1;
    latestLoadRef.current = loadId;
    setIsLoading(true);
    setLoadError(null);

    const timeout = window.setTimeout(
      () => {
        setIsLoadingMore(false);
        setHasMore(false);

        void fetchEndorsementsPage(
          targetAccountId,
          mode,
          0,
          searchQueryForFetch
        )
          .then((response) => {
            if (latestLoadRef.current !== loadId) return;
            setItems(response.endorsements);
            setTotal(response.total);
            setHasMore(response.hasMore);
          })
          .catch((error) => {
            if (latestLoadRef.current !== loadId) return;
            setLoadError(
              error instanceof Error
                ? error.message
                : 'Endorsements query failed'
            );
            setItems([]);
            setTotal(0);
            setHasMore(false);
          })
          .finally(() => {
            if (latestLoadRef.current === loadId) setIsLoading(false);
          });
      },
      serverSearchActive ? 220 : 0
    );

    return () => window.clearTimeout(timeout);
  }, [mode, searchQueryForFetch, serverSearchActive, targetAccountId]);

  const loadMore = useCallback(async () => {
    if (isLoading || isLoadingMore || !hasMore) return;

    const loadId = latestLoadRef.current;
    const offset = items.length;
    setIsLoadingMore(true);
    setLoadError(null);

    try {
      const response = await fetchEndorsementsPage(
        targetAccountId,
        mode,
        offset,
        searchQueryForFetch
      );
      if (latestLoadRef.current !== loadId) return;
      setItems((current) =>
        mergeEndorsementPages(current, response.endorsements)
      );
      setTotal(response.total);
      setHasMore(response.hasMore);
    } catch (error) {
      if (latestLoadRef.current !== loadId) return;
      setLoadError(
        error instanceof Error ? error.message : 'Endorsements query failed'
      );
    } finally {
      if (latestLoadRef.current === loadId) setIsLoadingMore(false);
    }
  }, [
    hasMore,
    isLoading,
    isLoadingMore,
    items.length,
    mode,
    searchQueryForFetch,
    targetAccountId,
  ]);

  useEffect(() => {
    if (!hasMore || isLoading || isLoadingMore || focusedEndorsement) return;

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
  }, [
    focusedEndorsement,
    hasMore,
    isLoading,
    isLoadingMore,
    items.length,
    loadMore,
  ]);

  const filtered = useMemo(() => {
    let list = [...items];

    if (focusedEndorsement) {
      list = list.filter((r) => isSameEndorsement(r, focusedEndorsement));
    }

    if (activeTopic) {
      list = list.filter(
        (r) =>
          normalizeEndorsementTopic(r.topic ?? '').toLowerCase() ===
          activeTopic.toLowerCase()
      );
    }

    const q = query.trim().toLowerCase();
    if (q && !serverSearchActive) {
      list = list.filter((r) => {
        const account = cleanHandle(
          mode === 'received' ? r.issuer : r.target
        ).toLowerCase();
        const topic = (r.topic ?? '').toLowerCase();
        const topicLabel = humanizeEndorsementTopic(r.topic).toLowerCase();
        const note = (r.note ?? '').toLowerCase();
        return (
          account.includes(q) ||
          topic.includes(q) ||
          topicLabel.includes(q) ||
          note.includes(q)
        );
      });
    }

    return list.sort((a, b) => {
      const aAccount = mode === 'received' ? a.issuer : a.target;
      const bAccount = mode === 'received' ? b.issuer : b.target;
      const aMine = aAccount === viewerAccountId;
      const bMine = bAccount === viewerAccountId;
      if (aMine !== bMine) return aMine ? -1 : 1;
      return (endorsementTimestamp(b) ?? 0) - (endorsementTimestamp(a) ?? 0);
    });
  }, [
    activeTopic,
    focusedEndorsement,
    items,
    mode,
    query,
    serverSearchActive,
    viewerAccountId,
  ]);

  const topicChips = useMemo(
    () => (focusedEndorsement ? [] : topTopics(items, 8)),
    [focusedEndorsement, items]
  );

  const hasActiveFilters =
    activeTopic !== null ||
    query.trim().length > 0 ||
    Boolean(focusedEndorsement);
  const totalCount = total;
  const segmentCounts = {
    received:
      endorsementCounts?.received ??
      (mode === 'received' ? totalCount : 0),
    given:
      endorsementCounts?.given ?? (mode === 'given' ? totalCount : 0),
  };

  const viewOptions = useMemo(
    () =>
      buildEndorsementViewOptions({
        accountId: targetAccountId,
        activeMode: mode,
        counts: segmentCounts,
        preserveTopic: initialTopic,
      }),
    [initialTopic, mode, segmentCounts, targetAccountId]
  );

  const resultsSummary = useMemo(() => {
    if (filtered.length === 0 && isLoading) return null;

    const shown = filtered.length.toLocaleString();
    if (serverSearchActive && query.trim()) {
      if (totalCount > 0) {
        return hasMore
          ? `Showing ${shown} of ${totalCount.toLocaleString()} matching endorsements`
          : `${totalCount.toLocaleString()} matching endorsement${totalCount === 1 ? '' : 's'}`;
      }
    }
    if (query.trim() || activeTopic || focusedEndorsement) {
      return hasMore
        ? `Showing ${shown} matching endorsements`
        : `${shown} matching endorsement${filtered.length === 1 ? '' : 's'}`;
    }
    if (totalCount > 0) {
      return `Showing ${items.length.toLocaleString()} of ${totalCount.toLocaleString()}`;
    }
    return `Showing ${shown}`;
  }, [
    activeTopic,
    focusedEndorsement,
    filtered.length,
    hasMore,
    isLoading,
    items.length,
    query,
    serverSearchActive,
    totalCount,
  ]);

  const modalTargetAccountId = editingFromList?.target ?? targetAccountId;
  const modalTargetDisplayName = editingFromList
    ? cleanHandle(editingFromList.target)
    : targetDisplayName;
  const modalTargetAvatarUrl = editingFromList
    ? editingFromList.target === targetAccountId
      ? targetAvatarUrl
      : (editingFromList.targetAvatarUrl ?? null)
    : targetAvatarUrl;

  const viewerExistingTopics = useMemo(
    () =>
      viewerAccountId
        ? items
            .filter(
              (e) =>
                e.issuer === viewerAccountId &&
                e.target === modalTargetAccountId
            )
            .map((e) => normalizeEndorsementTopic(e.topic ?? ''))
            .filter(Boolean)
        : [],
    [items, modalTargetAccountId, viewerAccountId]
  );

  const handleEndorseSubmit = async (input: EndorsementSubmitInput) => {
    if (!onEndorse) return;
    const writeTarget = editingFromList?.target ?? targetAccountId;
    const { previousTopic, ...buildInput } = input;
    await onEndorse(writeTarget, input);
    if (viewerAccountId) {
      const optimistic: EnrichedEndorsementListItem = {
        issuer: viewerAccountId,
        target: writeTarget,
        v: 1,
        since: Date.now(),
        topic: buildInput.topic,
        note: buildInput.note,
        expiresAt: buildInput.expiresAt,
        blockHeight: 0,
        blockTimestamp: Date.now(),
        issuerAvatarUrl: editingFromList?.issuerAvatarUrl ?? viewerAvatarUrl,
        targetAvatarUrl:
          editingFromList?.target === writeTarget
            ? editingFromList.targetAvatarUrl
            : writeTarget === targetAccountId
              ? targetAvatarUrl
              : null,
      };
      setItems((current) => {
        const mergeList = (list: EnrichedEndorsementListItem[]) =>
          mergeEndorsementsAfterUpsert(list, {
            issuer: viewerAccountId,
            target: writeTarget,
            previousTopic,
            next: optimistic,
          });
        return mode === 'given' && viewerAccountId === targetAccountId
          ? mergeList(current)
          : mode === 'received' && writeTarget === targetAccountId
            ? mergeList(current)
            : current;
      });
      setTotal((current) => current + 1);
    }
    setEndorseOpen(false);
    setEditingFromList(null);
  };

  const handleRemoveEndorsement = async (topic?: string) => {
    if (!onRemoveEndorsement || !viewerAccountId) return;
    const writeTarget = editingFromList?.target ?? targetAccountId;
    await onRemoveEndorsement(writeTarget, topic);
    const normalizedTopic = normalizeEndorsementTopic(topic ?? '');
    setItems((current) =>
      current.filter(
        (item) =>
          !(
            item.issuer === viewerAccountId &&
            item.target === writeTarget &&
            normalizeEndorsementTopic(item.topic ?? '') === normalizedTopic
          )
      )
    );
    setTotal((current) => Math.max(0, current - 1));
    setEndorseOpen(false);
    setEditingFromList(null);
  };

  const handleRowClick = (
    endorsement: EnrichedEndorsementListItem,
    accountId: string
  ) => {
    if (focusedEndorsement) {
      onSelectAccount?.(accountId);
      return;
    }

    setQuery('');
    setActiveTopic(null);
    setFocusedEndorsement(endorsement);
  };

  const emptyLabel = hasActiveFilters
    ? 'No matching endorsements.'
    : mode === 'received'
      ? isSelf
        ? 'No endorsements received yet.'
        : `No endorsements received for ${targetDisplayName} yet.`
      : isSelf
        ? 'You have not given any endorsements yet.'
        : `${targetDisplayName} has not given any endorsements yet.`;

  const showListSkeleton =
    (!metaLoaded || isLoading) && filtered.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <ProfileListFilterRail
        menuLabel="Endorsements"
        options={viewOptions}
        activeOptionId={mode}
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search people, topics, or notes"
        searchHidden={Boolean(focusedEndorsement)}
        clearAriaLabel="Clear endorsements search"
        autoFocus={metaLoaded}
        isLoading={!metaLoaded}
        trailing={
          mode === 'received' && canEndorse && onEndorse ? (
            <button
              type="button"
              onClick={() => {
                setEditingFromList(null);
                setEndorseOpen(true);
              }}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 portal-type-body font-medium transition-colors portal-gold-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--portal-gold-accent)]"
            >
              {hasSocialSession ? 'Endorse' : 'Authorize'}
            </button>
          ) : null
        }
      />

      {focusedEndorsement ? (
        <div className="flex items-center justify-end">
          <ProfileViewAllButton
            onClick={() => {
              setActiveTopic(null);
              setQuery('');
              setFocusedEndorsement(null);
            }}
            ariaLabel="View all endorsements"
          />
        </div>
      ) : topicChips.length > 0 ? (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex min-w-max items-center gap-1.5 pr-2">
              <span className="portal-eyebrow text-muted-foreground/55">
                Topics
              </span>
              {topicChips.map(({ topic, label, count }) => {
                const active = activeTopic === topic;
                return (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => setActiveTopic(active ? null : topic)}
                    aria-pressed={active}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 portal-type-label transition-colors',
                      active
                        ? 'border-border/60 bg-background font-medium text-foreground shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]'
                        : 'border-transparent text-muted-foreground hover:border-border/40 hover:text-foreground'
                    )}
                  >
                    <span>{label}</span>
                    <span className="portal-type-caption tabular-nums opacity-70">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={() => {
                setActiveTopic(null);
                setQuery('');
                setFocusedEndorsement(null);
              }}
              className="shrink-0 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear
            </button>
          ) : null}
        </div>
      ) : hasActiveFilters ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setActiveTopic(null);
              setQuery('');
              setFocusedEndorsement(null);
            }}
            className="shrink-0 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear
          </button>
        </div>
      ) : null}

      {loadError ? (
        <p className="rounded-xl border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--portal-red)]">
          {loadError}
        </p>
      ) : null}

      {showListSkeleton ? (
        <ProfileListSkeletonRows variant="endorsement" count={6} />
      ) : filtered.length === 0 ? (
        <div className="px-3 py-6 text-center text-sm text-muted-foreground/65">
          {emptyLabel}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {filtered.map((rec, idx) => {
              const focusAccountId =
                mode === 'received' ? rec.issuer : rec.target;
              const canUpdateThisEndorsement =
                rec.issuer === viewerAccountId && Boolean(onEndorse);
              const timeLabel = formatEndorsementTime(
                endorsementTimestamp(rec)
              );
              const timeDescription = timeLabel
                ? `Endorsement ${timeLabel}`
                : undefined;
              const issuerAvatarUrl =
                rec.issuerAvatarUrl ??
                (rec.issuer === viewerAccountId
                  ? viewerAvatarUrl
                  : rec.issuer === targetAccountId
                    ? targetAvatarUrl
                    : null);
              const targetAvatarSource =
                rec.targetAvatarUrl ??
                (rec.target === targetAccountId ? targetAvatarUrl : null);

              return (
                <div
                  key={`${rec.issuer}:${rec.target}:${rec.topic ?? ''}:${idx}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleRowClick(rec, focusAccountId)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleRowClick(rec, focusAccountId);
                    }
                  }}
                  className={endorsementListRowClass}
                  aria-label={
                    focusedEndorsement && onSelectAccount
                      ? `Open profile for ${focusAccountId}`
                      : `Endorsement from ${cleanHandle(rec.issuer)} to ${cleanHandle(rec.target)}`
                  }
                >
                  <EndorsementRecord
                    issuer={rec.issuer}
                    target={rec.target}
                    issuerName={rec.issuerName}
                    targetName={
                      rec.targetName ??
                      (rec.target === targetAccountId
                        ? targetDisplayName
                        : null)
                    }
                    issuerAvatarUrl={issuerAvatarUrl}
                    targetAvatarUrl={targetAvatarSource}
                    viewerAccountId={viewerAccountId}
                    topic={rec.topic}
                    note={rec.note}
                    onSelectAccount={
                      onSelectAccount
                        ? (partyAccountId) => onSelectAccount(partyAccountId)
                        : undefined
                    }
                    timeLabel={
                      timeLabel ? (
                        <PortalHoverTooltip
                          className="text-right portal-type-caption tabular-nums text-muted-foreground/40"
                          aria-label={timeDescription}
                          stopPropagation
                          tooltip={timeDescription}
                        >
                          {timeLabel}
                        </PortalHoverTooltip>
                      ) : undefined
                    }
                    trailing={
                      canUpdateThisEndorsement ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingFromList(rec);
                            setEndorseOpen(true);
                          }}
                          className={profileSocialStandingButtonClass(true)}
                          aria-label={`Update endorsement for ${humanizeEndorsementTopic(rec.topic) || 'general'}`}
                        >
                          <PenLine className="h-2.5 w-2.5" strokeWidth={2.5} />
                          Update
                        </button>
                      ) : undefined
                    }
                  />
                </div>
              );
            })}
          </div>
          {!focusedEndorsement && !query.trim() && !activeTopic ? (
            <ProfileListLoadMoreFooter
              loadMoreSentinelRef={loadMoreSentinelRef}
              resultsSummary={resultsSummary}
              isLoadingMore={isLoadingMore}
              skeletonVariant="endorsement"
            />
          ) : null}
        </>
      )}

      <EndorseModal
        key={`${targetAccountId}:${editingFromList?.issuer ?? 'new'}:${
          editingFromList?.topic ?? ''
        }`}
        open={endorseOpen}
        targetAccountId={modalTargetAccountId}
        targetDisplayName={modalTargetDisplayName}
        targetAvatarUrl={modalTargetAvatarUrl}
        issuerAccountId={viewerAccountId}
        existing={
          editingFromList
            ? {
                topic: editingFromList.topic,
                note: editingFromList.note,
              }
            : null
        }
        existingTopics={viewerExistingTopics}
        isSaving={isSavingEndorsement}
        onOpenChange={(open) => {
          setEndorseOpen(open);
          if (!open) setEditingFromList(null);
        }}
        onSubmit={handleEndorseSubmit}
        onRemove={editingFromList ? handleRemoveEndorsement : undefined}
      />
    </div>
  );
}
