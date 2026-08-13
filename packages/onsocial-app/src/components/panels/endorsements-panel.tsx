'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  EndorsementPanelItem,
  EndorsementsPanelResponse,
} from '@/lib/endorsements-panel-data';
import { EndorseComposeSheet } from '@/components/panels/endorse-compose-sheet';
import {
  EndorsementListRow,
  EndorsementListSkeleton,
} from '@/components/panels/endorsement-list-row';
import { OsSheetAction, OsSheetActions } from '@/components/ui/os-sheet-action';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { accountIdsEqual } from '@/lib/account-match';
import { displayName } from '@/lib/profile-display';

type EndorsementsMode = 'received' | 'given';

interface EndorsementsPanelProps {
  accountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  initial?: EndorsementsPanelResponse | null;
}

async function fetchEndorsements(
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
  };
}

export function EndorsementsPanel({
  accountId,
  profileName = null,
  avatarUrl = null,
  initial = null,
}: EndorsementsPanelProps) {
  const { accountId: viewerAccountId, isConnected, connect } = useAppWallet();
  const [mode, setMode] = useState<EndorsementsMode>('received');
  const [data, setData] = useState<EndorsementsPanelResponse | null>(
    () => initial
  );
  const [loading, setLoading] = useState(() => !initial);
  const [error, setError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const isSelf =
    Boolean(viewerAccountId) &&
    accountIdsEqual(viewerAccountId!, accountId);
  const label = displayName(accountId, profileName ?? undefined);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    const soft = Boolean(opts?.soft);
    if (!soft) {
      setLoading(true);
    }
    setError(null);
    try {
      const next = await fetchEndorsements(accountId);
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
  }, [accountId]);

  useEffect(() => {
    void load({ soft: Boolean(initial) });
  }, [accountId, initial, load]);

  const items = mode === 'received' ? (data?.received ?? []) : (data?.given ?? []);
  const receivedCount = data?.counts.received ?? 0;
  const givenCount = data?.counts.given ?? 0;

  function handleEndorseClick() {
    if (!isConnected) {
      void connect();
      return;
    }
    setComposeOpen(true);
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
          <OsSheetActions layout="row-compact" className="endorsements-endorse-cta">
            <OsSheetAction
              type="button"
              ready
              onClick={handleEndorseClick}
            >
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
        <div className="endorsement-list">
          {items.map((item) => (
            <EndorsementListRow
              key={`${item.issuer}:${item.target}:${item.topic ?? ''}:${item.blockHeight}`}
              item={item}
              pageAccountId={accountId}
              mode={mode}
            />
          ))}
        </div>
      )}

      <EndorseComposeSheet
        open={composeOpen}
        pageAccountId={accountId}
        profileName={profileName}
        avatarUrl={avatarUrl}
        onOpenChange={setComposeOpen}
        onSuccess={() => void load()}
      />
    </div>
  );
}
