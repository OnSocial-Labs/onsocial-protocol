'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  EndorseExistingDraft,
  EndorsementPanelItem,
  EndorsementsMode,
  EndorsementsModePageResponse,
  EndorsementsPanelResponse,
} from '@/lib/endorsements-panel-data';
import { ENDORSEMENTS_PAGE_SIZE } from '@/lib/endorsements-panel-data';
import {
  EndorseComposeSheet,
  type EndorseComposeIntent,
} from '@/components/panels/endorse-compose-sheet';
import {
  EndorsementListRow,
  EndorsementListSkeleton,
} from '@/components/panels/endorsement-list-row';
import { EndorsementFocusSheet } from '@/components/panels/endorsement-focus-sheet';
import {
  EndorsementSupportSheet,
  type EndorsementSupportTarget,
} from '@/components/panels/endorsement-support-sheet';
import { DiscoverProfilesLink } from '@/components/panels/standing-discover-link';
import { Divider, OsSheetAction, OsSheetActions } from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import { useViewerEndorsement } from '@/hooks/use-viewer-endorsement';
import { useViewerRelationship } from '@/hooks/use-viewer-relationship';
import { accountIdsEqual } from '@/lib/account-match';
import { isBlockEitherWay } from '@/lib/viewer-mute-block-filter';
import { buildEndorsementEmptyState } from '@/lib/endorsement-empty-state';
import { parseEndorsementMediaRef } from '@/lib/endorsement-media';
import { matchEndorsementFocusItem } from '@/lib/endorsement-focus';
import { endorsementsPath } from '@/lib/overlay-routes';
import { displayName } from '@/lib/profile-display';
import { SHEET_Z } from '@/lib/sheet-z';
import { resolveEndorsementSpendTargetId } from '@/lib/social-spend-endorsement';
import { replaceBrowserUrl } from '@/lib/sync-browser-url-query';
import { getGlobalViewerEndorsementLedger } from '@/lib/viewer-endorsement-global';
import { derivePortfolioEndorsementCounts } from '@/lib/viewer-endorsement-ledger';
import type { ResolvedMood } from '@/lib/moods/types';

interface EndorsementsPanelProps {
  accountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  mood?: ResolvedMood | null;
  initial?: EndorsementsPanelResponse | null;
  /** Soft-nav `?mode=given` from face signals / shared overlay URLs. */
  initialMode?: EndorsementsMode;
}

type ComposeSession = {
  targetAccountId: string;
  targetName: string | null;
  targetAvatarUrl: string | null;
  intent: EndorseComposeIntent;
  existing: EndorseExistingDraft | null;
};

async function fetchEndorsementsBundle(
  accountId: string
): Promise<EndorsementsPanelResponse> {
  const response = await fetch(
    `/api/profile/endorsements?accountId=${encodeURIComponent(accountId)}`,
    { cache: 'no-store' }
  );
  const body = (await response.json().catch(() => null)) as
    | (Partial<EndorsementsPanelResponse> & {
        error?: string;
        detail?: string;
      })
    | null;

  if (!response.ok) {
    throw new Error(
      body?.detail ?? body?.error ?? 'Could not load endorsements.'
    );
  }

  return {
    accountId: body?.accountId ?? accountId,
    counts: body?.counts ?? { received: 0, given: 0 },
    received: body?.received ?? [],
    given: body?.given ?? [],
    receivedHasMore: Boolean(body?.receivedHasMore),
    givenHasMore: Boolean(body?.givenHasMore),
  };
}

async function fetchEndorsementsModePage(
  accountId: string,
  mode: EndorsementsMode,
  offset: number
): Promise<EndorsementsModePageResponse> {
  const params = new URLSearchParams({
    accountId,
    mode,
    offset: String(offset),
    limit: String(ENDORSEMENTS_PAGE_SIZE),
  });
  const response = await fetch(`/api/profile/endorsements?${params}`, {
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => null)) as
    | (Partial<EndorsementsModePageResponse> & {
        error?: string;
        detail?: string;
      })
    | null;

  if (!response.ok) {
    throw new Error(
      body?.detail ?? body?.error ?? 'Could not load more endorsements.'
    );
  }

  return {
    accountId: body?.accountId ?? accountId,
    mode: body?.mode ?? mode,
    counts: body?.counts ?? { received: 0, given: 0 },
    items: body?.items ?? [],
    hasMore: Boolean(body?.hasMore),
    nextOffset: body?.nextOffset ?? null,
  };
}

function rowKey(item: EndorsementPanelItem): string {
  return `${item.issuer}:${item.target}:${item.topic ?? ''}:${item.blockHeight}`;
}

export function EndorsementsPanel({
  accountId,
  profileName = null,
  avatarUrl = null,
  mood = null,
  initial = null,
  initialMode = 'received',
}: EndorsementsPanelProps) {
  const { accountId: viewerAccountId, isConnected, connect } = useAppWallet();
  const { setTxResult } = useAppTransactionFeedback();
  const {
    viewerEndorsed,
    apiViewerEndorsed,
    apiViewerEndorsementTopics,
    isLoading: relationshipLoading,
  } = useViewerRelationship(accountId);
  const {
    endorsementSyncVersion,
    isEndorsePendingForTarget,
    deriveEndorsementItems,
    reconcileEndorsementListFromFetch,
    shouldFreshFetchEndorsementListFor,
  } = useViewerEndorsement(accountId);
  const endorsePending = isEndorsePendingForTarget(accountId);
  const endorseBlocked = isBlockEitherWay(accountId);
  const [mode, setMode] = useState<EndorsementsMode>(initialMode);
  const [data, setData] = useState<EndorsementsPanelResponse | null>(
    () => initial
  );
  const [loading, setLoading] = useState(() => !initial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSession, setComposeSession] = useState<ComposeSession | null>(
    null
  );
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportTarget, setSupportTarget] =
    useState<EndorsementSupportTarget | null>(null);
  const [focusOpen, setFocusOpen] = useState(false);
  const [focusItem, setFocusItem] = useState<EndorsementPanelItem | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const isSelf =
    Boolean(viewerAccountId) && accountIdsEqual(viewerAccountId!, accountId);
  const label = displayName(accountId, profileName ?? undefined);
  const emptyState = buildEndorsementEmptyState({
    mode,
    isSelf,
    displayName: label,
    viewerEndorsed,
  });

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      const soft = Boolean(opts?.soft);
      if (!soft) {
        setLoading(true);
      }
      setError(null);
      try {
        const next = await fetchEndorsementsBundle(accountId);
        reconcileEndorsementListFromFetch(
          [...next.received, ...next.given],
          viewerAccountId ?? null
        );
        setData(next);
      } catch (cause) {
        if (!soft) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load endorsements.'
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [accountId, reconcileEndorsementListFromFetch, viewerAccountId]
  );

  useEffect(() => {
    void load({ soft: Boolean(initial) });
  }, [accountId, initial, load]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const selectMode = useCallback(
    (next: EndorsementsMode) => {
      if (next === mode) return;
      setMode(next);
      setLoadMoreError(null);
      replaceBrowserUrl(endorsementsPath(accountId, { mode: next }));
    },
    [accountId, mode]
  );

  useEffect(() => {
    if (
      !shouldFreshFetchEndorsementListFor(
        accountId,
        viewerAccountId ?? null,
        mode
      )
    ) {
      return;
    }
    const timers = [2_000, 5_000].map((delay) =>
      window.setTimeout(() => {
        void load({ soft: true });
      }, delay)
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [
    accountId,
    endorsementSyncVersion,
    load,
    mode,
    shouldFreshFetchEndorsementListFor,
    viewerAccountId,
  ]);

  const apiItems =
    mode === 'received' ? (data?.received ?? []) : (data?.given ?? []);
  const derivedList = deriveEndorsementItems(
    apiItems,
    mode,
    viewerAccountId ?? null
  );
  const items = derivedList.items;
  const hasMore =
    mode === 'received'
      ? Boolean(data?.receivedHasMore)
      : Boolean(data?.givenHasMore);
  const adjustedCounts = derivePortfolioEndorsementCounts({
    pageAccountId: accountId,
    viewerAccountId: viewerAccountId ?? null,
    counts: data?.counts ?? { received: 0, given: 0 },
    apiViewerEndorsed,
    apiViewerEndorsementTopics,
    viewerItems: [...(data?.received ?? []), ...(data?.given ?? [])],
    ledger: getGlobalViewerEndorsementLedger(),
    relationshipKnown: isSelf || !relationshipLoading,
  });
  void endorsementSyncVersion;
  const receivedCount = adjustedCounts.received;
  const givenCount = adjustedCounts.given;

  useEffect(() => {
    if (!focusOpen || !focusItem) return;
    const next = matchEndorsementFocusItem(
      [...(data?.received ?? []), ...(data?.given ?? [])],
      {
        id: typeof focusItem.id === 'string' ? focusItem.id : null,
        issuer: focusItem.issuer,
        topic: focusItem.topic ?? null,
      }
    );
    if (next && next !== focusItem) setFocusItem(next);
  }, [data, focusItem, focusOpen]);

  const loadMore = useCallback(async () => {
    if (!data || loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page = await fetchEndorsementsModePage(
        accountId,
        mode,
        apiItems.length
      );
      reconcileEndorsementListFromFetch(page.items, viewerAccountId ?? null);
      setData((prev) => {
        if (!prev) return prev;
        return mode === 'received'
          ? {
              ...prev,
              counts: page.counts,
              received: [...prev.received, ...page.items],
              receivedHasMore: page.hasMore,
            }
          : {
              ...prev,
              counts: page.counts,
              given: [...prev.given, ...page.items],
              givenHasMore: page.hasMore,
            };
      });
    } catch (cause) {
      setLoadMoreError(
        cause instanceof Error
          ? cause.message
          : 'Could not load more endorsements.'
      );
    } finally {
      setLoadingMore(false);
    }
  }, [
    accountId,
    apiItems.length,
    data,
    hasMore,
    loading,
    loadingMore,
    mode,
    reconcileEndorsementListFromFetch,
    viewerAccountId,
  ]);

  useInfiniteScrollSentinel({
    sentinelRef: loadMoreRef,
    enabled:
      hasMore &&
      !loading &&
      !loadingMore &&
      !error &&
      !loadMoreError &&
      items.length > 0,
    onIntersect: () => {
      void loadMore();
    },
  });

  function openCompose(session: ComposeSession) {
    if (!isConnected) {
      void connect();
      return;
    }
    setComposeSession(session);
    setComposeOpen(true);
  }

  function handleEndorseClick() {
    if (endorsePending) return;
    if (endorseBlocked) {
      setTxResult({
        type: 'error',
        msg: 'Endorsement is unavailable while a block is in place.',
      });
      return;
    }
    openCompose({
      targetAccountId: accountId,
      targetName: profileName,
      targetAvatarUrl: avatarUrl,
      intent: viewerEndorsed ? 'auto' : 'create',
      existing: null,
    });
  }

  function handleAddTopic() {
    if (endorsePending) return;
    if (endorseBlocked) {
      setTxResult({
        type: 'error',
        msg: 'Endorsement is unavailable while a block is in place.',
      });
      return;
    }
    openCompose({
      targetAccountId: accountId,
      targetName: profileName,
      targetAvatarUrl: avatarUrl,
      intent: 'create',
      existing: null,
    });
  }

  function openSupport(item: EndorsementPanelItem) {
    const endorsementId = resolveEndorsementSpendTargetId({
      id: typeof item.id === 'string' ? item.id : null,
      issuer: item.issuer,
      target: item.target,
      topic: item.topic,
    });
    if (!endorsementId) return;
    if (!isConnected) {
      void connect();
      return;
    }
    setSupportTarget({
      endorsementId,
      recipientAccountId: item.target,
      recipientName: item.targetName,
      issuer: item.issuer,
      topic: item.topic ?? null,
    });
    setSupportOpen(true);
  }

  return (
    <div className="endorsements-panel">
      <div className="endorsements-panel-toolbar">
        <div
          className="endorsements-mode-rail"
          role="tablist"
          aria-label="Endorsement lists"
        >
          <button
            type="button"
            role="tab"
            id="endorsements-tab-received"
            aria-controls="endorsements-panel-received"
            aria-selected={mode === 'received'}
            className={`endorsements-mode-chip${
              mode === 'received' ? ' is-selected' : ''
            }`}
            onClick={() => selectMode('received')}
          >
            Received
            <span className="endorsements-mode-count">{receivedCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            id="endorsements-tab-given"
            aria-controls="endorsements-panel-given"
            aria-selected={mode === 'given'}
            className={`endorsements-mode-chip${
              mode === 'given' ? ' is-selected' : ''
            }`}
            onClick={() => selectMode('given')}
          >
            Given
            <span className="endorsements-mode-count">{givenCount}</span>
          </button>
        </div>

        {!isSelf ? (
          <div className="endorsements-endorse-cta">
            <OsSheetActions layout="row-compact">
              <OsSheetAction
                type="button"
                ready={!endorseBlocked}
                disabled={endorsePending}
                pending={endorsePending}
                pendingLabel={
                  viewerEndorsed ? 'Updating…' : 'Endorsing…'
                }
                onClick={handleEndorseClick}
              >
                {!isConnected
                  ? 'Connect'
                  : viewerEndorsed
                    ? 'Edit'
                    : 'Endorse'}
              </OsSheetAction>
            </OsSheetActions>
            {isConnected && viewerEndorsed && !endorseBlocked ? (
              <button
                type="button"
                className="endorsements-add-topic"
                onClick={handleAddTopic}
                disabled={endorsePending}
                aria-label={`Add another endorsement for ${label}`}
              >
                Add topic
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {loading ? (
        <EndorsementListSkeleton />
      ) : error ? (
        <div
          className="endorsements-empty"
          role="tabpanel"
          id={`endorsements-panel-${mode}`}
          aria-labelledby={`endorsements-tab-${mode}`}
        >
          <p className="endorsements-empty-copy">{error}</p>
          <button
            type="button"
            className="endorsements-retry"
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div
          className="standing-panel-empty-block"
          role="tabpanel"
          id={`endorsements-panel-${mode}`}
          aria-labelledby={`endorsements-tab-${mode}`}
        >
          <div className="standing-panel-empty-state">
            <p className="standing-panel-empty-primary">{emptyState.primary}</p>
            {emptyState.secondary ? (
              <p className="standing-panel-empty-secondary">
                {emptyState.secondary}
              </p>
            ) : null}
            {emptyState.showDiscover ? (
              <div className="standing-panel-empty-actions">
                <DiscoverProfilesLink
                  accountId={accountId}
                  tab="profiles"
                  ariaLabel="Discover profiles to endorse"
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div
          className="standing-list endorsement-list"
          role="tabpanel"
          id={`endorsements-panel-${mode}`}
          aria-labelledby={`endorsements-tab-${mode}`}
        >
          {items.map((item, index) => {
            const viewerOwns =
              Boolean(viewerAccountId) &&
              accountIdsEqual(viewerAccountId!, item.issuer);
            const canSupport =
              Boolean(resolveEndorsementSpendTargetId({
                id: typeof item.id === 'string' ? item.id : null,
                issuer: item.issuer,
                target: item.target,
                topic: item.topic,
              })) &&
              (!viewerAccountId ||
                !accountIdsEqual(viewerAccountId, item.target));
            return (
              <div key={rowKey(item)}>
                {index > 0 ? <Divider variant="item" /> : null}
                <EndorsementListRow
                  item={item}
                  pageAccountId={accountId}
                  mode={mode}
                  viewerAccountId={viewerAccountId}
                  canEdit={viewerOwns}
                  onEdit={() =>
                    openCompose({
                      targetAccountId: item.target,
                      targetName: item.targetName,
                      targetAvatarUrl: item.targetAvatarUrl,
                      intent: 'edit',
                      existing: {
                        id: typeof item.id === 'string' ? item.id : null,
                        topic: item.topic ?? null,
                        note: item.note ?? null,
                        media: parseEndorsementMediaRef(item.media),
                        mediaUrl: item.mediaUrl ?? null,
                      },
                    })
                  }
                  canSupport={canSupport}
                  onSupport={() => openSupport(item)}
                  onOpen={() => {
                    setFocusItem(item);
                    setFocusOpen(true);
                  }}
                />
              </div>
            );
          })}
          <div ref={loadMoreRef} className="endorsements-load-more" />
          {loadingMore ? (
            <p className="endorsements-loading-more">Loading more…</p>
          ) : loadMoreError ? (
            <div className="endorsements-load-more-error">
              <p className="endorsements-loading-more">{loadMoreError}</p>
              <button
                type="button"
                className="endorsements-retry"
                onClick={() => void loadMore()}
              >
                Retry
              </button>
            </div>
          ) : null}
        </div>
      )}

      <EndorseComposeSheet
        open={composeOpen}
        pageAccountId={composeSession?.targetAccountId ?? accountId}
        profileName={composeSession?.targetName ?? profileName}
        avatarUrl={composeSession?.targetAvatarUrl ?? avatarUrl}
        mood={
          composeSession &&
          !accountIdsEqual(composeSession.targetAccountId, accountId)
            ? null
            : mood
        }
        intent={composeSession?.intent ?? 'create'}
        existing={composeSession?.existing ?? null}
        onOpenChange={(next) => {
          setComposeOpen(next);
          if (!next) setComposeSession(null);
        }}
        onSuccess={() => void load({ soft: true })}
      />

      <EndorsementFocusSheet
        open={focusOpen}
        item={focusItem}
        pageAccountId={accountId}
        mood={mood}
        zIndex={SHEET_Z.nested}
        onOpenChange={(next) => {
          setFocusOpen(next);
          if (!next) setFocusItem(null);
        }}
        onSuccess={() => void load({ soft: true })}
      />

      <EndorsementSupportSheet
        open={supportOpen}
        target={supportTarget}
        mood={
          supportTarget &&
          !accountIdsEqual(supportTarget.recipientAccountId, accountId)
            ? null
            : mood
        }
        onOpenChange={(next) => {
          setSupportOpen(next);
          if (!next) setSupportTarget(null);
        }}
        onSuccess={() => void load({ soft: true })}
      />
    </div>
  );
}
