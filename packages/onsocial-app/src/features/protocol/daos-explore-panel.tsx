'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  LauncherHomeEmpty,
  LauncherHomeError,
  LauncherPeekList,
  LauncherPeekRow,
} from '@/components/launcher-home';
import {
  fetchProtocolProposalPeeks,
  type ProtocolProposalPeek,
} from '@/features/protocol/protocol-feed-client';
import { statusLabel } from '@/features/protocol/protocol-card-view';
import type { ProtocolDaoProposalStatus } from '@/features/protocol/types';
import type { MyDaoMembership } from '@/features/protocol/my-daos-client';
import {
  PROTOCOL_PROPOSAL_PEEK_DAO_LIMIT,
  PROTOCOL_PROPOSAL_PEEK_LIMIT,
} from '@/features/protocol/protocol-proposal-peek-limits';
import { daoPortfolioPath } from '@/lib/app-routes';

const EXPLORE_DAO_LIMIT = PROTOCOL_PROPOSAL_PEEK_DAO_LIMIT;
const EXPLORE_PEEK_LIMIT = PROTOCOL_PROPOSAL_PEEK_LIMIT;

export type DaosExplorePeek = {
  key: string;
  daoAccountId: string;
  daoName: string;
  proposalId: number;
  label: string;
  statusLabel: string;
  createdAt: string;
  open: boolean;
};

function mapPeek(row: ProtocolProposalPeek): DaosExplorePeek {
  const status = String(row.status || 'InProgress');
  return {
    key: `${row.daoAccountId}:${row.proposalId}`,
    daoAccountId: row.daoAccountId,
    daoName: row.daoName || row.daoAccountId,
    proposalId: row.proposalId,
    label: (row.label || `Proposal #${row.proposalId}`).trim().slice(0, 120),
    statusLabel: statusLabel(status as ProtocolDaoProposalStatus),
    createdAt: row.createdAt || '',
    open: Boolean(row.open),
  };
}

/**
 * Membership-scoped proposal peeks under DAOs Home.
 * One multi-DAO snapshot query (not N× full governance feeds).
 */
export function DaosExplorePanel({
  accountId,
  myDaos,
}: {
  accountId: string | null;
  myDaos: MyDaoMembership[] | null;
}) {
  const [peeks, setPeeks] = useState<DaosExplorePeek[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const daoIds = useMemo(() => {
    if (!myDaos) return [];
    return myDaos
      .map((row) => row.daoAccountId.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, EXPLORE_DAO_LIMIT);
  }, [myDaos]);

  useEffect(() => {
    if (!accountId) {
      queueMicrotask(() => {
        setPeeks(null);
        setPending(false);
        setError(null);
      });
      return;
    }
    if (myDaos == null) {
      queueMicrotask(() => {
        setPeeks(null);
        setPending(true);
        setError(null);
      });
      return;
    }
    if (daoIds.length === 0) {
      queueMicrotask(() => {
        setPeeks([]);
        setPending(false);
        setError(null);
      });
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setPending(true);
        setError(null);
      }
    });

    void (async () => {
      try {
        const rows = await fetchProtocolProposalPeeks(
          daoIds,
          EXPLORE_PEEK_LIMIT
        );
        if (cancelled) return;
        setPeeks(rows.map(mapPeek));
        setError(null);
        setPending(false);
      } catch (cause) {
        if (cancelled) return;
        setPeeks(null);
        setPending(false);
        setError(
          cause instanceof Error ? cause.message : 'Couldn’t load proposals.'
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId, daoIds, myDaos, retryKey]);

  if (!accountId) {
    return null;
  }

  if (error) {
    return (
      <LauncherHomeError
        message={error}
        onRetry={() => setRetryKey((value) => value + 1)}
      />
    );
  }

  if (myDaos == null || pending) {
    return <LauncherHomeEmpty>Loading proposals…</LauncherHomeEmpty>;
  }

  if (daoIds.length === 0) {
    return null;
  }

  if (!peeks || peeks.length === 0) {
    return <LauncherHomeEmpty>Nothing open right now.</LauncherHomeEmpty>;
  }

  return (
    <LauncherPeekList aria-label="Proposals from your DAOs">
      {peeks.map((peek) => (
        <LauncherPeekRow
          key={peek.key}
          href={daoPortfolioPath(peek.daoAccountId, {
            proposal: peek.proposalId,
          })}
          title={peek.label}
          meta={
            <>
              {peek.daoName}
              <span aria-hidden> · </span>
              {peek.statusLabel}
            </>
          }
        />
      ))}
    </LauncherPeekList>
  );
}
