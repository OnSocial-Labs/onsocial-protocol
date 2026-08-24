'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  LauncherHomeEmpty,
  LauncherHomeError,
  LauncherSocialPeekList,
  LauncherSocialPeekRow,
  LauncherSocialPeekSkeleton,
  launcherPeekOverflowLabel,
  LAUNCHER_PEEK_DISPLAY_LIMIT,
} from '@/components/launcher-home';
import { appDiscoverTabHref } from '@/features/discover/discover-tabs';
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
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { daoPortfolioPath } from '@/lib/app-routes';
import { formatRelativePostTimestamp } from '@/lib/post-display';

const EXPLORE_DAO_LIMIT = PROTOCOL_PROPOSAL_PEEK_DAO_LIMIT;
const EXPLORE_PEEK_LIMIT = PROTOCOL_PROPOSAL_PEEK_LIMIT;

export type DaosExplorePeek = {
  key: string;
  daoAccountId: string;
  daoName: string;
  proposer: string;
  proposalId: number;
  label: string;
  statusLabel: string;
  createdAtMs: number;
  href: string;
};

function mapPeek(row: ProtocolProposalPeek): DaosExplorePeek {
  const status = String(row.status || 'InProgress');
  const createdAtMs = row.createdAt ? Date.parse(row.createdAt) : 0;
  return {
    key: `${row.daoAccountId}:${row.proposalId}`,
    daoAccountId: row.daoAccountId,
    daoName: row.daoName || row.daoAccountId,
    proposer: row.proposer?.trim() || row.daoAccountId,
    proposalId: row.proposalId,
    label: (row.label || `Proposal #${row.proposalId}`).trim().slice(0, 120),
    statusLabel: statusLabel(status as ProtocolDaoProposalStatus),
    createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
    href: daoPortfolioPath(row.daoAccountId, {
      proposal: row.proposalId,
    }),
  };
}

function daoContextLabel(peek: DaosExplorePeek): string {
  const named =
    peek.daoName.trim().toLowerCase() !== peek.daoAccountId.trim().toLowerCase();
  if (named) {
    return `${peek.daoName} · ${peek.statusLabel}`;
  }
  return `${peek.daoAccountId} · ${peek.statusLabel}`;
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

  const visiblePeeks = useMemo(
    () => (peeks ?? []).slice(0, LAUNCHER_PEEK_DISPLAY_LIMIT),
    [peeks]
  );

  const proposerIds = useMemo(
    () => visiblePeeks.map((peek) => peek.proposer),
    [visiblePeeks]
  );
  const proposerProfiles = usePostAuthorProfiles(proposerIds);
  const discoverDaosHref = appDiscoverTabHref('daos');
  const overflowLabel = launcherPeekOverflowLabel(
    peeks?.length ?? 0,
    'discover',
    LAUNCHER_PEEK_DISPLAY_LIMIT
  );

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
    return <LauncherSocialPeekSkeleton count={5} />;
  }

  if (daoIds.length === 0) {
    return null;
  }

  if (!peeks || peeks.length === 0) {
    return <LauncherHomeEmpty>Nothing open right now.</LauncherHomeEmpty>;
  }

  return (
    <LauncherSocialPeekList
      aria-label="Latest proposals from your DAOs"
      footer={
        overflowLabel ? (
          <p className="launcher-home-more">
            <Link
              href={discoverDaosHref}
              className="launcher-home-inline-link"
              scroll={false}
            >
              {overflowLabel}
            </Link>
          </p>
        ) : null
      }
    >
      {visiblePeeks.map((peek, index) => {
        const profile = proposerProfiles[peek.proposer];
        const timeLabel =
          peek.createdAtMs > 0
            ? formatRelativePostTimestamp(peek.createdAtMs)
            : null;

        return (
          <LauncherSocialPeekRow
            key={peek.key}
            href={peek.href}
            accountId={peek.proposer}
            profileName={profile?.displayName}
            avatarUrl={profile?.avatarUrl}
            contextLabel={daoContextLabel(peek)}
            timeLabel={timeLabel}
            timeTitle={
              peek.createdAtMs > 0
                ? new Date(peek.createdAtMs).toISOString()
                : undefined
            }
            excerpt={peek.label}
            showDivider={index > 0}
          />
        );
      })}
    </LauncherSocialPeekList>
  );
}
