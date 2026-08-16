'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { OsField, osFieldBorderedClassName } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  PROTOCOL_COMMUNITY_DAO_SEED,
  readRecentCommunityDaos,
  resolveKnownBoardForDaoAccount,
} from '@/features/protocol/dao-accounts';
import { daoEntityKindLabel } from '@/features/protocol/dao-branding';
import {
  fetchDaoCatalog,
  type DaoCatalogEntry,
} from '@/features/protocol/dao-catalog-client';
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
import { formatDaoRoleLabel, sortDaoRoleIds } from '@/lib/page-drawer-meta';

interface DaoDirectoryEntry {
  accountId: string;
  label: string;
  description: string;
  kindLabel: string;
  roleLabels?: string[];
}

const DISCOVER_PAGE_SIZE = 20;

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
    const roleLabels = roleIds.map(formatDaoRoleLabel).filter(Boolean);
    return {
      accountId: row.daoAccountId,
      label: resolveDaoLabel(row.daoAccountId),
      description: resolveDaoDescription(row.daoAccountId, roleLabels),
      kindLabel: daoEntityKindLabel(board),
      roleLabels,
    };
  });
}

function toCatalogEntries(rows: DaoCatalogEntry[]): DaoDirectoryEntry[] {
  return rows.map((row) => {
    const board =
      resolveKnownBoardForDaoAccount(row.daoAccountId) ?? 'community';
    return {
      accountId: row.daoAccountId,
      label: row.name?.trim() || row.daoAccountId,
      description: row.purpose?.trim() || 'Sputnik DAO',
      kindLabel: daoEntityKindLabel(board),
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
  const [discoverQuery, setDiscoverQuery] = useState('');
  const [discoverDraft, setDiscoverDraft] = useState('');
  const [discoverRows, setDiscoverRows] = useState<DaoCatalogEntry[] | null>(
    null
  );
  const [discoverTotal, setDiscoverTotal] = useState(0);
  const [discoverOffset, setDiscoverOffset] = useState(0);
  const [discoverSyncing, setDiscoverSyncing] = useState(false);
  const [discoverFactoryCount, setDiscoverFactoryCount] = useState(0);
  const [discoverIndexedCount, setDiscoverIndexedCount] = useState(0);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [discoverPending, setDiscoverPending] = useState(true);

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

  useEffect(() => {
    let cancelled = false;
    void fetchDaoCatalog({
      q: discoverQuery,
      limit: DISCOVER_PAGE_SIZE,
      offset: discoverOffset,
    })
      .then((response) => {
        if (cancelled) return;
        setDiscoverPending(false);
        setDiscoverError(null);
        setDiscoverRows((prev) =>
          discoverOffset > 0 && prev
            ? [...prev, ...response.daos]
            : response.daos
        );
        setDiscoverTotal(response.total);
        setDiscoverSyncing(response.syncing);
        setDiscoverFactoryCount(response.factoryCount);
        setDiscoverIndexedCount(response.indexedCount);
      })
      .catch((error) => {
        if (cancelled) return;
        setDiscoverPending(false);
        setDiscoverError(
          error instanceof Error ? error.message : 'Could not load catalog.'
        );
        if (discoverOffset === 0) setDiscoverRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [discoverOffset, discoverQuery]);

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
      .map((id) => {
        const board = resolveKnownBoardForDaoAccount(id) ?? 'community';
        return {
          accountId: id,
          label: id,
          description: 'Recently opened community DAO',
          kindLabel: daoEntityKindLabel(board),
        };
      });
  }, [myEntries, recent]);

  const discoverEntries = useMemo(
    () => (discoverRows ? toCatalogEntries(discoverRows) : []),
    [discoverRows]
  );

  const showMyDaos = Boolean(accountId);
  const myDaosReady = myDaos !== null;
  const canLoadMore =
    discoverRows != null && discoverRows.length < discoverTotal;

  const submitDiscover = () => {
    const next = discoverDraft.trim();
    setDiscoverPending(true);
    setDiscoverError(null);
    setDiscoverOffset(0);
    setDiscoverRows(null);
    setDiscoverQuery(next);
  };

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
          stays the fast lane for Governance and Treasury boards. Discover
          browses every Sputnik factory DAO on this network.
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
                  <span className="daos-index-item-kind">
                    {entry.kindLabel}
                  </span>
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

        <section className="daos-index-section" aria-label="Discover DAOs">
          <h2 className="daos-index-heading">Discover</h2>
          <form
            className="daos-discover-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitDiscover();
            }}
          >
            <OsField
              label="Search Sputnik DAOs"
              htmlFor="daos-discover-q"
              hint="Account id or name"
            >
              <input
                id="daos-discover-q"
                value={discoverDraft}
                onChange={(event) => setDiscoverDraft(event.target.value)}
                placeholder="e.g. demo.sputnikv2.testnet"
                className={osFieldBorderedClassName}
                autoComplete="off"
              />
            </OsField>
            <button type="submit" className="daos-discover-submit">
              Search
            </button>
          </form>

          <p className="daos-index-empty">
            {discoverSyncing
              ? `Indexing factory catalog… ${discoverIndexedCount.toLocaleString()} indexed`
              : `${discoverTotal.toLocaleString()} DAOs${
                  discoverFactoryCount > 0
                    ? ` · factory ${discoverFactoryCount.toLocaleString()}`
                    : ''
                }`}
            {discoverQuery ? ` · “${discoverQuery}”` : ''}
          </p>

          {discoverError ? (
            <p className="daos-index-empty">{discoverError}</p>
          ) : null}

          {discoverRows == null && discoverPending ? (
            <p className="daos-index-empty">Loading catalog…</p>
          ) : discoverEntries.length === 0 ? (
            <p className="daos-index-empty">
              No DAOs match yet. Try a full account id — unknown DAOs resolve
              live when `get_config` succeeds.
            </p>
          ) : (
            <>
              <ul className="daos-index-list">
                {discoverEntries.map((entry) => (
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
              {canLoadMore ? (
                <button
                  type="button"
                  className="daos-discover-more"
                  disabled={discoverPending}
                  onClick={() => {
                    setDiscoverPending(true);
                    setDiscoverOffset((prev) => prev + DISCOVER_PAGE_SIZE);
                  }}
                >
                  {discoverPending ? 'Loading…' : 'Load more'}
                </button>
              ) : null}
            </>
          )}
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
