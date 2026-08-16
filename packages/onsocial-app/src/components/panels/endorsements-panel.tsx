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
import {
  EndorsementSupportSheet,
  type EndorsementSupportTarget,
} from '@/components/panels/endorsement-support-sheet';
import { Divider, OsSheetAction, OsSheetActions } from '@onsocial/ui';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import { accountIdsEqual } from '@/lib/account-match';
import { parseEndorsementMediaRef } from '@/lib/endorsement-media';
import { displayName } from '@/lib/profile-display';
import { resolveEndorsementSpendTargetId } from '@/lib/social-spend-endorsement';
import type { ResolvedMood } from '@/lib/moods/types';

interface EndorsementsPanelProps {
  accountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  mood?: ResolvedMood | null;
  initial?: EndorsementsPanelResponse | null;
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
}: EndorsementsPanelProps) {
  const { accountId: viewerAccountId, isConnected, connect } = useAppWallet();
  const [mode, setMode] = useState<EndorsementsMode>('received');
  const [data, setData] = useState<EndorsementsPanelResponse | null>(
    () => initial
  );
  const [loading, setLoading] = useState(() => !initial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSession, setComposeSession] = useState<ComposeSession | null>(
    null
  );
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportTarget, setSupportTarget] =
    useState<EndorsementSupportTarget | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const isSelf =
    Boolean(viewerAccountId) && accountIdsEqual(viewerAccountId!, accountId);
  const label = displayName(accountId, profileName ?? undefined);

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      const soft = Boolean(opts?.soft);
      if (!soft) {
        setLoading(true);
      }
      setError(null);
      try {
        const next = await fetchEndorsementsBundle(accountId);
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
    [accountId]
  );

  useEffect(() => {
    void load({ soft: Boolean(initial) });
  }, [accountId, initial, load]);

  const items =
    mode === 'received' ? (data?.received ?? []) : (data?.given ?? []);
  const hasMore =
    mode === 'received'
      ? Boolean(data?.receivedHasMore)
      : Boolean(data?.givenHasMore);
  const receivedCount = data?.counts.received ?? 0;
  const givenCount = data?.counts.given ?? 0;

  const loadMore = useCallback(async () => {
    if (!data || loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchEndorsementsModePage(
        accountId,
        mode,
        items.length
      );
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
    } catch {
      /* Keep prior list; user can retry by scrolling again. */
    } finally {
      setLoadingMore(false);
    }
  }, [accountId, data, hasMore, items.length, loading, loadingMore, mode]);

  useInfiniteScrollSentinel({
    sentinelRef: loadMoreRef,
    enabled: hasMore && !loading && !loadingMore && !error && items.length > 0,
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
            aria-selected={mode === 'received'}
            className={`endorsements-mode-chip${
              mode === 'received' ? ' is-selected' : ''
            }`}
            onClick={() => setMode('received')}
          >
            Received
            <span className="endorsements-mode-count">{receivedCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'given'}
            className={`endorsements-mode-chip${
              mode === 'given' ? ' is-selected' : ''
            }`}
            onClick={() => setMode('given')}
          >
            Given
            <span className="endorsements-mode-count">{givenCount}</span>
          </button>
        </div>

        {!isSelf ? (
          <OsSheetActions
            layout="row-compact"
            className="endorsements-endorse-cta"
          >
            <OsSheetAction type="button" ready onClick={handleEndorseClick}>
              {isConnected ? 'Endorse' : 'Connect'}
            </OsSheetAction>
          </OsSheetActions>
        ) : null}
      </div>

      {loading ? (
        <EndorsementListSkeleton />
      ) : error ? (
        <div className="endorsements-empty">
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
        <div className="endorsements-empty">
          <p className="endorsements-empty-copy">
            {mode === 'received'
              ? `No endorsements for ${label} yet.`
              : `${label} hasn’t endorsed anyone yet.`}
          </p>
          {!isSelf && mode === 'received' ? (
            <p className="endorsements-empty-hint">
              Be the first to put your name behind them.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="standing-list endorsement-list">
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
                />
              </div>
            );
          })}
          <div ref={loadMoreRef} className="endorsements-load-more" />
          {loadingMore ? (
            <p className="endorsements-loading-more">Loading more…</p>
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
