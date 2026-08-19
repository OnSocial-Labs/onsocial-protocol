'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { fetchProtocolFeed } from '@/features/protocol/protocol-feed-client';
import { statusLabel } from '@/features/protocol/protocol-card-view';
import type { ProtocolDaoProposalStatus } from '@/features/protocol/types';
import type { MyDaoMembership } from '@/features/protocol/my-daos-client';
import { resolveDaoDirectoryName } from '@/features/protocol/dao-directory';
import { daoPortfolioPath } from '@/lib/app-routes';
import { appDiscoverTabHref } from '@/features/discover/discover-tabs';

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
  const discoverDaosHref = appDiscoverTabHref('daos');
  const [peeks, setPeeks] = useState<DaosExplorePeek[] | null>(null);
  const [pending, setPending] = useState(false);

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
      });
      return;
    }
    if (myDaos == null) {
      queueMicrotask(() => {
        setPeeks(null);
        setPending(true);
      });
      return;
    }
    if (daoIds.length === 0) {
      queueMicrotask(() => {
        setPeeks([]);
        setPending(false);
      });
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setPending(true);
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
      for (const result of settled) {
        if (result.status === 'fulfilled') merged.push(...result.value);
      }
      merged.sort((a, b) => {
        if (a.open !== b.open) return a.open ? -1 : 1;
        return (
          Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '') || 0
        );
      });
      setPeeks(merged.slice(0, EXPLORE_PEEK_LIMIT));
      setPending(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId, daoIds, myDaos]);

  if (!accountId) {
    return (
      <p className="daos-index-empty">
        Proposals from your DAOs appear here after you connect.
      </p>
    );
  }

  if (myDaos == null || pending) {
    return <p className="daos-index-empty">Loading proposals…</p>;
  }

  if (daoIds.length === 0) {
    return (
      <p className="daos-index-empty">
        Join or create a DAO to see proposals here.{' '}
        <Link href={discoverDaosHref} className="daos-index-inline-link">
          Browse DAOs
        </Link>
      </p>
    );
  }

  if (!peeks || peeks.length === 0) {
    return (
      <p className="daos-index-empty">
        No proposals across your DAOs yet. Open an org to propose.
      </p>
    );
  }

  return (
    <ul className="daos-explore-list" aria-label="Proposals from your DAOs">
      {peeks.map((peek) => (
        <li key={peek.key}>
          <Link
            href={daoPortfolioPath(peek.daoAccountId, {
              proposal: peek.proposalId,
            })}
            className="daos-explore-row"
            scroll={false}
          >
            <span className="daos-explore-row-copy">
              <span className="daos-explore-row-title">{peek.label}</span>
              <span className="daos-explore-row-meta">
                {peek.daoName}
                <span aria-hidden> · </span>
                {peek.statusLabel}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
