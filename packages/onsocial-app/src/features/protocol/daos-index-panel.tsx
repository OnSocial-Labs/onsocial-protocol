'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  PROTOCOL_COMMUNITY_DAO_SEED,
  readRecentCommunityDaos,
  resolveKnownBoardForDaoAccount,
} from '@/features/protocol/dao-accounts';
import { daoEntityKindLabel } from '@/features/protocol/dao-branding';
import {
  fetchMyDaos,
  type MyDaoMembership,
} from '@/features/protocol/my-daos-client';
import {
  APP_GROUPS_PATH,
  APP_PROTOCOL_PATH,
  daoPath,
  protocolPath,
} from '@/lib/app-routes';
import {
  formatDaoRoleLabel,
  sortDaoRoleIds,
} from '@/lib/page-drawer-meta';

interface DaoDirectoryEntry {
  accountId: string;
  label: string;
  description: string;
  kindLabel: string;
  roleLabels?: string[];
}

function resolveDaoLabel(accountId: string): string {
  const seed = PROTOCOL_COMMUNITY_DAO_SEED.find(
    (entry) => entry.accountId === accountId
  );
  return seed?.label ?? accountId;
}

function resolveDaoDescription(
  accountId: string,
  roleLabels: string[]
): string {
  const seed = PROTOCOL_COMMUNITY_DAO_SEED.find(
    (entry) => entry.accountId === accountId
  );
  if (roleLabels.length > 0) {
    return roleLabels.join(' · ');
  }
  return seed?.description ?? 'DAO membership';
}

function toMyDaoEntries(rows: MyDaoMembership[]): DaoDirectoryEntry[] {
  return rows.map((row) => {
    const board =
      resolveKnownBoardForDaoAccount(row.daoAccountId) ?? 'community';
    const roleIds = sortDaoRoleIds(row.roleNames);
    const roleLabels = roleIds
      .map(formatDaoRoleLabel)
      .filter(Boolean);
    return {
      accountId: row.daoAccountId,
      label: resolveDaoLabel(row.daoAccountId),
      description: resolveDaoDescription(row.daoAccountId, roleLabels),
      kindLabel: daoEntityKindLabel(board),
      roleLabels,
    };
  });
}

/** Community DAO directory — launcher home for org DAO portfolios. */
export function DaosIndexPanel() {
  const { accountId } = useAppWallet();
  const [recent] = useState(() =>
    typeof window === 'undefined' ? [] : readRecentCommunityDaos()
  );
  const [myDaos, setMyDaos] = useState<MyDaoMembership[] | null>(null);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    void fetchMyDaos(accountId)
      .then((response) => {
        if (!cancelled) setMyDaos(response.daos);
      })
      .catch(() => {
        if (!cancelled) setMyDaos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const myEntries = useMemo(
    () => (myDaos ? toMyDaoEntries(myDaos) : []),
    [myDaos]
  );

  const featured = useMemo((): DaoDirectoryEntry[] => {
    return PROTOCOL_COMMUNITY_DAO_SEED.map((entry) => {
      const board =
        resolveKnownBoardForDaoAccount(entry.accountId) ?? 'community';
      return {
        accountId: entry.accountId,
        label: entry.label,
        description: entry.description,
        kindLabel: daoEntityKindLabel(board),
      };
    });
  }, []);

  const recentEntries = useMemo((): DaoDirectoryEntry[] => {
    const myIds = new Set(myEntries.map((entry) => entry.accountId));
    return recent
      .filter(
        (id) =>
          !PROTOCOL_COMMUNITY_DAO_SEED.some((seed) => seed.accountId === id) &&
          !myIds.has(id)
      )
      .map((accountId) => {
        const board =
          resolveKnownBoardForDaoAccount(accountId) ?? 'community';
        return {
          accountId,
          label: accountId,
          description: 'Recently opened community DAO',
          kindLabel: daoEntityKindLabel(board),
        };
      });
  }, [myEntries, recent]);

  const showMyDaos = Boolean(accountId);
  const myDaosReady = myDaos !== null;

  return (
    <OsAppScreen
      title="DAOs"
      subtitle="Org homes — cover, crest, proposals"
      backFallbackHref="/"
      glassChrome
    >
      <div className="daos-index">
        <p className="daos-index-lede">
          Each DAO has a portfolio page with cover and square crest. Protocol
          stays the fast lane for Governance and Treasury boards.
        </p>

        <div className="daos-index-shortcuts">
          <Link
            href={protocolPath({ board: 'governance' })}
            className="daos-index-chip"
          >
            Governance board
          </Link>
          <Link
            href={protocolPath({ board: 'treasury' })}
            className="daos-index-chip"
          >
            Treasury board
          </Link>
          <Link href={APP_GROUPS_PATH} className="daos-index-chip">
            Communities
          </Link>
          <Link href={APP_PROTOCOL_PATH} className="daos-index-chip">
            Protocol
          </Link>
        </div>

        {showMyDaos ? (
          <section className="daos-index-section" aria-label="My DAOs">
            <h2 className="daos-index-heading">My DAOs</h2>
            {!myDaosReady ? (
              <p className="daos-index-empty">Loading memberships…</p>
            ) : myEntries.length === 0 ? (
              <p className="daos-index-empty">
                No indexed DAO roles yet. Open a DAO board once to index it —
                Governance and Treasury are warmed automatically.
              </p>
            ) : (
              <ul className="daos-index-list">
                {myEntries.map((entry) => (
                  <li key={entry.accountId}>
                    <Link
                      href={daoPath(entry.accountId)}
                      className="daos-index-item"
                    >
                      <span className="daos-index-item-kind">
                        {entry.kindLabel}
                      </span>
                      <span className="daos-index-item-title">
                        {entry.label}
                      </span>
                      <span className="daos-index-item-copy">
                        {entry.description}
                      </span>
                      <span className="daos-index-item-id">
                        {entry.accountId}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <section className="daos-index-section" aria-label="OnSocial DAOs">
          <h2 className="daos-index-heading">OnSocial</h2>
          <ul className="daos-index-list">
            {featured.map((entry) => (
              <li key={entry.accountId}>
                <Link
                  href={daoPath(entry.accountId)}
                  className="daos-index-item"
                >
                  <span className="daos-index-item-kind">{entry.kindLabel}</span>
                  <span className="daos-index-item-title">{entry.label}</span>
                  <span className="daos-index-item-copy">
                    {entry.description}
                  </span>
                  <span className="daos-index-item-id">{entry.accountId}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {recentEntries.length > 0 ? (
          <section
            className="daos-index-section"
            aria-label="Recent community DAOs"
          >
            <h2 className="daos-index-heading">Recent communities</h2>
            <ul className="daos-index-list">
              {recentEntries.map((entry) => (
                <li key={entry.accountId}>
                  <Link
                    href={daoPath(entry.accountId)}
                    className="daos-index-item"
                  >
                    <span className="daos-index-item-kind">
                      {entry.kindLabel}
                    </span>
                    <span className="daos-index-item-title">{entry.label}</span>
                    <span className="daos-index-item-copy">
                      {entry.description}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </OsAppScreen>
  );
}
