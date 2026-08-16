'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { OsAppScreen } from '@/components/app/os-app-screen';
import {
  PROTOCOL_COMMUNITY_DAO_SEED,
  readRecentCommunityDaos,
  resolveKnownBoardForDaoAccount,
} from '@/features/protocol/dao-accounts';
import { daoEntityKindLabel } from '@/features/protocol/dao-branding';
import {
  APP_GROUPS_PATH,
  APP_PROTOCOL_PATH,
  daoPath,
  protocolPath,
} from '@/lib/app-routes';

interface DaoDirectoryEntry {
  accountId: string;
  label: string;
  description: string;
  kindLabel: string;
}

/** Community DAO directory — launcher home for org DAO portfolios. */
export function DaosIndexPanel() {
  const [recent] = useState(() =>
    typeof window === 'undefined' ? [] : readRecentCommunityDaos()
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
    return recent
      .filter(
        (id) =>
          !PROTOCOL_COMMUNITY_DAO_SEED.some((seed) => seed.accountId === id)
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
  }, [recent]);

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
          <Link href={protocolPath({ board: 'governance' })} className="daos-index-chip">
            Governance board
          </Link>
          <Link href={protocolPath({ board: 'treasury' })} className="daos-index-chip">
            Treasury board
          </Link>
          <Link href={APP_GROUPS_PATH} className="daos-index-chip">
            Communities
          </Link>
          <Link href={APP_PROTOCOL_PATH} className="daos-index-chip">
            Protocol
          </Link>
        </div>

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
                  <span className="daos-index-item-copy">{entry.description}</span>
                  <span className="daos-index-item-id">{entry.accountId}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {recentEntries.length > 0 ? (
          <section className="daos-index-section" aria-label="Recent community DAOs">
            <h2 className="daos-index-heading">Recent communities</h2>
            <ul className="daos-index-list">
              {recentEntries.map((entry) => (
                <li key={entry.accountId}>
                  <Link
                    href={daoPath(entry.accountId)}
                    className="daos-index-item"
                  >
                    <span className="daos-index-item-kind">{entry.kindLabel}</span>
                    <span className="daos-index-item-title">{entry.label}</span>
                    <span className="daos-index-item-copy">{entry.description}</span>
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
