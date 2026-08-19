'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  LauncherHomeEmpty,
  LauncherHomeError,
  LauncherPeekList,
  LauncherPeekRow,
} from '@/components/launcher-home';
import { fetchProtocolFeed } from '@/features/protocol/protocol-feed-client';
import { statusLabel } from '@/features/protocol/protocol-card-view';
import type { ProtocolDaoProposalStatus } from '@/features/protocol/types';
import type { MyDaoMembership } from '@/features/protocol/my-daos-client';
import { resolveDaoDirectoryName } from '@/features/protocol/dao-directory';
import { daoPortfolioPath } from '@/lib/app-routes';

const EXPLORE_DAO_LIMIT = 12;
const EXPLORE_PEEK_LIMIT = 24;

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

function isOpenStatus(status: string): boolean {
  return status === 'InProgress' || status.toLowerCase() === 'open';
}

/**
 * Membership-scoped proposal peeks under DAOs Home.
 * Network catalog stays in Discover; this is activity across *your* DAOs.
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
      const settled = await Promise.allSettled(
        daoIds.map(async (daoAccountId) => {
          const feed = await fetchProtocolFeed(daoAccountId, 'all');
          const daoName = resolveDaoDirectoryName(daoAccountId, {
            name: null,
          });
          return feed.applications
            .map((app) => {
              const proposalId = app.governance_proposal?.proposal_id;
              if (proposalId == null || !Number.isInteger(proposalId)) {
                return null;
              }
              const rawStatus =
                app.governance_proposal?.snapshot?.status ??
                app.governance_proposal?.status ??
                app.status;
              const status = String(rawStatus || 'InProgress');
              return {
                key: `${daoAccountId}:${proposalId}`,
                daoAccountId,
                daoName,
                proposalId,
                label: (app.label || app.description || `Proposal #${proposalId}`)
                  .trim()
                  .slice(0, 120),
                statusLabel: statusLabel(
                  status as ProtocolDaoProposalStatus
                ),
                createdAt: app.created_at || '',
                open: isOpenStatus(status),
              } satisfies DaosExplorePeek;
            })
            .filter((row): row is DaosExplorePeek => row != null);
        })
      );

      if (cancelled) return;

      const merged: DaosExplorePeek[] = [];
      let rejected = 0;
      for (const result of settled) {
        if (result.status === 'fulfilled') merged.push(...result.value);
        else rejected += 1;
      }

      if (merged.length === 0 && rejected === daoIds.length) {
        setPeeks(null);
        setError('Couldn’t load proposals.');
        setPending(false);
        return;
      }

      merged.sort((a, b) => {
        if (a.open !== b.open) return a.open ? -1 : 1;
        return (
          Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '') || 0
        );
      });
      setPeeks(merged.slice(0, EXPLORE_PEEK_LIMIT));
      setError(null);
      setPending(false);
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
