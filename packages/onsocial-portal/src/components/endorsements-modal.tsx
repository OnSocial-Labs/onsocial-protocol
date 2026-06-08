'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { PenLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModalCloseButton } from '@/components/ui/modal-close-button';
import { ModalHeader } from '@/components/ui/modal-header';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import {
  EndorsementRecord,
  endorsementListRowClass,
} from '@/components/ui/endorsement-flow';
import { profileSocialStandingButtonClass } from '@/components/ui/profile-action-pill';
import { ProfileListSearchBar } from '@/features/profile/profile-list-search-bar';
import {
  ProfileListLoadMoreFooter,
  ProfileViewAllButton,
} from '@/features/profile/profile-list-loading';
import { Skeleton } from '@/components/ui/skeleton';
import { portalElevatedShadowClass } from '@/components/ui/floating-panel';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
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
import { PROFILE_SEARCH_MIN_QUERY_LENGTH } from '@/lib/profile-account-search';
import { EndorseModal } from './endorse-modal';

export type EndorsementsModalMode = 'received' | 'given';

type EnrichedEndorsementListItem = EndorsementListItem & {
  issuerName?: string | null;
  issuerAvatarUrl?: string | null;
  targetName?: string | null;
  targetAvatarUrl?: string | null;
};

interface EndorsementCounts {
  received: number;
  given: number;
}

interface EndorsementsPageResponse {
  accountId: string;
  mode: EndorsementsModalMode;
  limit: number;
  offset: number;
  hasMore: boolean;
  total: number;
  endorsements: EnrichedEndorsementListItem[];
}

const ENDORSEMENT_PAGE_SIZE = 24;

interface EndorsementsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: EndorsementsModalMode;
  isSelf: boolean;
  targetAccountId: string;
  targetDisplayName: string;
  targetAvatarUrl?: string | null;
  endorsements: EnrichedEndorsementListItem[];
  endorsementCounts?: EndorsementCounts | null;
  viewerToTargetEndorsements?: EnrichedEndorsementListItem[];
  viewerAccountId: string | null;
  viewerAvatarUrl?: string | null;
  onSelectAccount?: (accountId: string) => void;
  canEndorse?: boolean;
  isSavingEndorsement?: boolean;
  onEndorse?: (
    targetAccountId: string,
    input: EndorsementSubmitInput
  ) => Promise<unknown>;
  onRemoveEndorsement?: (
    targetAccountId: string,
    topic?: string
  ) => Promise<unknown>;
  focusedEndorsement?: EnrichedEndorsementListItem | null;
  onClearFocusedEndorsement?: () => void;
  initialTopic?: string | null;
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

function uniqueTargetCount(
  endorsements: EnrichedEndorsementListItem[]
): number {
  return new Set(endorsements.map((item) => item.target)).size;
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
  mode: EndorsementsModalMode,
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

/** @deprecated Prefer the /u/[accountId]/endorsements page. Kept for legacy entry points. */
export function EndorsementsModal({
  open,
  onOpenChange,
  mode,
  isSelf,
  targetAccountId,
  targetDisplayName,
  targetAvatarUrl = null,
  endorsements,
  endorsementCounts = null,
  viewerToTargetEndorsements = [],
  viewerAccountId,
  viewerAvatarUrl = null,
  onSelectAccount,
  canEndorse = false,
  isSavingEndorsement = false,
  onEndorse,
  onRemoveEndorsement,
  focusedEndorsement = null,
  onClearFocusedEndorsement,
  initialTopic = null,
}: EndorsementsModalProps) {
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [items, setItems] = useState<EnrichedEndorsementListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [internalFocusedEndorsement, setInternalFocusedEndorsement] =
    useState<EnrichedEndorsementListItem | null>(null);

  const [endorseOpen, setEndorseOpen] = useState(false);
  const [editingFromList, setEditingFromList] =
    useState<EnrichedEndorsementListItem | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const latestLoadRef = useRef(0);
  useBodyScrollLock(open, scrollRef);
  const effectiveFocusedEndorsement =
    focusedEndorsement ?? internalFocusedEndorsement;

  const knownEndorsements = useMemo(() => {
    const merged = mergeEndorsementPages(items, endorsements);
    if (viewerToTargetEndorsements.length === 0) return merged;
    return mergeEndorsementPages(merged, viewerToTargetEndorsements);
  }, [endorsements, items, viewerToTargetEndorsements]);
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
        ? knownEndorsements
            .filter(
              (e) =>
                e.issuer === viewerAccountId &&
                e.target === modalTargetAccountId
            )
            .map((e) => normalizeEndorsementTopic(e.topic ?? ''))
            .filter(Boolean)
        : [],
    [knownEndorsements, modalTargetAccountId, viewerAccountId]
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveTopic(initialTopic ?? null);
    setInternalFocusedEndorsement(null);
  }, [mode, open, targetAccountId, initialTopic]);

  const serverSearchActive =
    query.trim().length >= PROFILE_SEARCH_MIN_QUERY_LENGTH;
  const searchQueryForFetch = serverSearchActive ? query.trim() : '';

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
        setIsLoadingMore(false);
        setLoadError(null);
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
  }, [mode, open, searchQueryForFetch, serverSearchActive, targetAccountId]);

  const loadMore = useCallback(async () => {
    if (!open || isLoading || isLoadingMore || !hasMore) return;

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
    open,
    searchQueryForFetch,
    targetAccountId,
  ]);

  useEffect(() => {
    if (!open || !hasMore || isLoading || isLoadingMore) return;

    const sentinel = loadMoreSentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root) return;

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
  }, [hasMore, isLoading, isLoadingMore, items.length, loadMore, open]);

  const closeModal = () => {
    setQuery('');
    setActiveTopic(null);
    setInternalFocusedEndorsement(null);
    onClearFocusedEndorsement?.();
    onOpenChange(false);
  };

  const source = items;

  const filtered = useMemo(() => {
    let list = [...source];

    if (effectiveFocusedEndorsement) {
      list = list.filter((r) =>
        isSameEndorsement(r, effectiveFocusedEndorsement)
      );
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
    source,
    query,
    activeTopic,
    viewerAccountId,
    effectiveFocusedEndorsement,
    mode,
    serverSearchActive,
  ]);

  const topicChips = useMemo(
    () => (effectiveFocusedEndorsement ? [] : topTopics(source, 8)),
    [source, effectiveFocusedEndorsement]
  );

  const hasActiveFilters =
    activeTopic !== null ||
    query.trim().length > 0 ||
    !!effectiveFocusedEndorsement;
  const totalCount =
    total > 0
      ? total
      : mode === 'received'
        ? (endorsementCounts?.received ?? source.length)
        : (endorsementCounts?.given ?? source.length);
  const targetCount = uniqueTargetCount(source);
  const endorsementCountLabel = `${totalCount.toLocaleString()} ${
    totalCount === 1 ? 'ENDORSEMENT' : 'ENDORSEMENTS'
  }`;
  const targetCountLabel = `${targetCount.toLocaleString()} ${
    targetCount === 1 ? 'ACCOUNT' : 'ACCOUNTS'
  }`;
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
    if (query.trim() || activeTopic || effectiveFocusedEndorsement) {
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
    effectiveFocusedEndorsement,
    filtered.length,
    hasMore,
    isLoading,
    items.length,
    query,
    serverSearchActive,
    totalCount,
  ]);
  const endorsementMeta =
    mode === 'received'
      ? `${endorsementCountLabel} RECEIVED`
      : isSelf
        ? `YOU GAVE ${endorsementCountLabel} · ${targetCountLabel}`
        : `THEY GAVE ${endorsementCountLabel} · ${targetCountLabel}`;

  const handleSelect = (accountId: string) => {
    closeModal();
    onSelectAccount?.(accountId);
  };

  const clearFocusedEndorsement = () => {
    setInternalFocusedEndorsement(null);
    onClearFocusedEndorsement?.();
  };

  const handleRowClick = (
    endorsement: EnrichedEndorsementListItem,
    accountId: string
  ) => {
    if (effectiveFocusedEndorsement) {
      if (onSelectAccount) {
        handleSelect(accountId);
      }
      return;
    }

    setQuery('');
    setActiveTopic(null);
    setInternalFocusedEndorsement(endorsement);
  };

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
        issuerAvatarUrl: editingFromList?.issuerAvatarUrl ?? null,
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
  };

  const handleRemoveEndorsement = async (topic?: string) => {
    if (!onRemoveEndorsement || !viewerAccountId) return;
    const writeTarget = editingFromList?.target ?? targetAccountId;
    await onRemoveEndorsement(writeTarget, topic);
    const normalizedTopic = normalizeEndorsementTopic(topic ?? '');
    setItems((current) => {
      const removeMatching = (list: EnrichedEndorsementListItem[]) =>
        list.filter(
          (item) =>
            !(
              item.issuer === viewerAccountId &&
              item.target === writeTarget &&
              normalizeEndorsementTopic(item.topic ?? '') === normalizedTopic
            )
        );
      const next =
        mode === 'given' && viewerAccountId === targetAccountId
          ? removeMatching(current)
          : mode === 'received' && writeTarget === targetAccountId
            ? removeMatching(current)
            : current;
      return next.length === current.length ? current : next;
    });
    setTotal((current) => Math.max(0, current - 1));
    setEndorseOpen(false);
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="endorsements-list"
            {...fadeMotion(reduceMotion ? 0 : 0.18)}
            data-lenis-prevent
            className="fixed inset-0 z-[2147483646] flex items-center justify-center px-4 py-6"
          >
            <button
              type="button"
              className="absolute inset-0 bg-background/72 backdrop-blur-md"
              onClick={closeModal}
              aria-label="Close endorsements"
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
              aria-labelledby="endorsements-modal-title"
              className={cn(
                'relative flex h-[min(720px,calc(100vh-2rem))] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border/67 bg-background/98',
                portalElevatedShadowClass
              )}
            >
              <ModalHeader
                titleId="endorsements-modal-title"
                title={targetDisplayName}
                description={endorsementMeta}
                descriptionVariant="meta"
                actions={
                  <>
                    {mode === 'received' && canEndorse && onEndorse ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFromList(null);
                          closeModal();
                          setEndorseOpen(true);
                        }}
                        className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 portal-type-body font-medium transition-colors portal-gold-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--portal-gold-accent)]"
                      >
                        Endorse
                      </button>
                    ) : null}
                    <ModalCloseButton
                      ariaLabel="Close endorsements"
                      onClick={closeModal}
                    />
                  </>
                }
              />

              <div className="shrink-0 space-y-4 px-4 pb-4 md:px-5">
                {!effectiveFocusedEndorsement ? (
                  <ProfileListSearchBar
                    query={query}
                    onQueryChange={setQuery}
                    placeholder="Search people, topics, or notes"
                    autoFocus
                    maxLength={80}
                    clearAriaLabel="Clear endorsements search"
                  />
                ) : null}

                {effectiveFocusedEndorsement ? (
                  <div className="flex items-center justify-end">
                    <ProfileViewAllButton
                      onClick={() => {
                        setActiveTopic(null);
                        setQuery('');
                        clearFocusedEndorsement();
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
                              onClick={() =>
                                setActiveTopic(active ? null : topic)
                              }
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
                          clearFocusedEndorsement();
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
                        clearFocusedEndorsement();
                      }}
                      className="shrink-0 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Clear
                    </button>
                  </div>
                ) : null}
              </div>

              {loadError ? (
                <p className="mx-4 mb-3 rounded-xl border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--portal-red)] md:mx-5">
                  {loadError}
                </p>
              ) : null}

              <div
                ref={scrollRef}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 md:px-5"
              >
                {isLoading && filtered.length === 0 ? (
                  <div className="space-y-1" aria-hidden>
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div key={index} className="space-y-2 px-2 py-2">
                        <Skeleton className="h-4 w-28 bg-foreground/[0.08]" />
                        <Skeleton className="h-3 w-full max-w-sm bg-foreground/5" />
                        <Skeleton className="h-px w-full divider-detail bg-foreground/5" />
                        <Skeleton className="h-3 w-44 bg-foreground/5" />
                      </div>
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground/65">
                    No matching endorsements.
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
                          (rec.target === targetAccountId
                            ? targetAvatarUrl
                            : null);

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
                              effectiveFocusedEndorsement && onSelectAccount
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
                                  ? (partyAccountId) =>
                                      handleSelect(partyAccountId)
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
                                    className={profileSocialStandingButtonClass(
                                      true
                                    )}
                                    aria-label={`Update endorsement for ${humanizeEndorsementTopic(rec.topic) || 'general'}`}
                                  >
                                    <PenLine
                                      className="h-2.5 w-2.5"
                                      strokeWidth={2.5}
                                    />
                                    Update
                                  </button>
                                ) : undefined
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                    {!effectiveFocusedEndorsement &&
                    !query.trim() &&
                    !activeTopic ? (
                      <ProfileListLoadMoreFooter
                        loadMoreSentinelRef={loadMoreSentinelRef}
                        resultsSummary={resultsSummary}
                        isLoadingMore={isLoadingMore}
                        skeletonVariant="endorsement"
                      />
                    ) : null}
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <EndorseModal
        key={editingFromList ? `edit:${editingFromList.topic ?? ''}` : 'new'}
        open={endorseOpen}
        onOpenChange={(open) => {
          setEndorseOpen(open);
          if (!open) setEditingFromList(null);
        }}
        targetAccountId={modalTargetAccountId}
        targetDisplayName={modalTargetDisplayName}
        targetAvatarUrl={modalTargetAvatarUrl}
        issuerAccountId={viewerAccountId}
        issuerAvatarUrl={editingFromList?.issuerAvatarUrl ?? viewerAvatarUrl}
        existing={
          editingFromList
            ? { topic: editingFromList.topic, note: editingFromList.note }
            : null
        }
        existingTopics={viewerExistingTopics}
        isSaving={isSavingEndorsement}
        onSubmit={handleEndorseSubmit}
        onRemove={editingFromList ? handleRemoveEndorsement : undefined}
      />
    </>,
    document.body
  );
}
