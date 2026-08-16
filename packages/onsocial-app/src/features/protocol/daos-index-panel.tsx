'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  PROTOCOL_COMMUNITY_DAO_SEED,
  readRecentCommunityDaos,
} from '@/features/protocol/dao-accounts';
import {
  daoDirectoryEntryFromMembership,
  daoDirectoryEntryFromRecent,
  daoDirectoryEntryFromSeed,
} from '@/features/protocol/dao-directory';
import { DaoDirectoryList } from '@/features/protocol/dao-directory-row';
import { DaoDiscoverSheet } from '@/features/protocol/dao-discover-sheet';
import {
  fetchMyDaos,
  type MyDaoMembership,
} from '@/features/protocol/my-daos-client';
import {
  clearOptimisticMyDao,
  readOptimisticMyDaos,
  type OptimisticMyDao,
} from '@/features/protocol/my-daos-optimistic';
import {
  GOVERNANCE_DAO_ACCOUNT,
  TREASURY_DAO_ACCOUNT,
} from '@/lib/app-config';
import { daoPath } from '@/lib/app-routes';

const MY_DAOS_SOFT_RETRY_MS = 2500;

function mergeMyDaosWithOptimistic(
  apiRows: MyDaoMembership[],
  optimistic: OptimisticMyDao[]
): MyDaoMembership[] {
  const byId = new Map(
    apiRows.map((row) => [row.daoAccountId.trim().toLowerCase(), row])
  );
  for (const hint of optimistic) {
    const id = hint.daoAccountId.trim().toLowerCase();
    if (byId.has(id)) {
      clearOptimisticMyDao(id);
      continue;
    }
    byId.set(id, {
      daoAccountId: hint.daoAccountId,
      roleNames: hint.roleNames,
      updatedAt: new Date(hint.labeledAt).toISOString(),
    });
  }
  return [...byId.values()].sort((a, b) =>
    a.daoAccountId.localeCompare(b.daoAccountId)
  );
}

/** Community DAO directory — Standing-style lists + Discover slide-over. */
export function DaosIndexPanel() {
  const { accountId } = useAppWallet();
  const [recent] = useState(() =>
    typeof window === 'undefined' ? [] : readRecentCommunityDaos()
  );
  const [myDaos, setMyDaos] = useState<MyDaoMembership[] | null>(null);
  const [discoverOpen, setDiscoverOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let softRetry: number | undefined;

    if (!accountId) {
      queueMicrotask(() => {
        if (!cancelled) setMyDaos(null);
      });
      return () => {
        cancelled = true;
      };
    }

    queueMicrotask(() => {
      if (cancelled) return;
      const optimistic = readOptimisticMyDaos();
      if (optimistic.length > 0) {
        setMyDaos(mergeMyDaosWithOptimistic([], optimistic));
      }
    });

    const loadMyDaos = () => {
      void fetchMyDaos(accountId)
        .then((response) => {
          if (cancelled) return;
          const merged = mergeMyDaosWithOptimistic(
            response.daos,
            readOptimisticMyDaos()
          );
          setMyDaos(merged);
          const stillMissing = readOptimisticMyDaos().some(
            (hint) =>
              !response.daos.some(
                (row) =>
                  row.daoAccountId.trim().toLowerCase() ===
                  hint.daoAccountId.trim().toLowerCase()
              )
          );
          if (stillMissing && softRetry == null) {
            softRetry = window.setTimeout(() => {
              softRetry = undefined;
              loadMyDaos();
            }, MY_DAOS_SOFT_RETRY_MS);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setMyDaos(mergeMyDaosWithOptimistic([], readOptimisticMyDaos()));
          }
        });
    };

    loadMyDaos();

    const onVisible = () => {
      if (document.visibilityState === 'visible') loadMyDaos();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      cancelled = true;
      if (softRetry != null) window.clearTimeout(softRetry);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [accountId]);

  const myEntries = useMemo(
    () => (myDaos ? myDaos.map(daoDirectoryEntryFromMembership) : []),
    [myDaos]
  );

  const featured = useMemo(
    () =>
      PROTOCOL_COMMUNITY_DAO_SEED.map((entry) =>
        daoDirectoryEntryFromSeed(entry.accountId)
      ),
    []
  );

  const recentEntries = useMemo(() => {
    const myIds = new Set(myEntries.map((entry) => entry.accountId));
    return recent
      .filter(
        (id) =>
          !PROTOCOL_COMMUNITY_DAO_SEED.some((seed) => seed.accountId === id) &&
          !myIds.has(id)
      )
      .map(daoDirectoryEntryFromRecent);
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
          Each DAO has a portfolio — cover, square crest, and proposals in
          context. Protocol opens Governance; flip to Treasury from that page.
          Discover opens the full factory catalog.
        </p>

        <div className="daos-index-shortcuts">
          <Link
            href={daoPath(GOVERNANCE_DAO_ACCOUNT)}
            className="daos-index-chip"
          >
            Governance
          </Link>
          <Link
            href={daoPath(TREASURY_DAO_ACCOUNT)}
            className="daos-index-chip"
          >
            Treasury
          </Link>
        </div>

        {showMyDaos ? (
          <section className="daos-index-section" aria-label="My DAOs">
            <h2 className="daos-index-heading">My DAOs</h2>
            {!myDaosReady ? (
              <p className="daos-index-empty">Loading memberships…</p>
            ) : (
              <DaoDirectoryList
                entries={myEntries}
                empty="No DAO roles yet. Open a DAO portfolio once — memberships appear here as soon as roles sync. Governance and Treasury are warmed automatically."
              />
            )}
          </section>
        ) : null}

        <section className="daos-index-section" aria-label="OnSocial DAOs">
          <h2 className="daos-index-heading">OnSocial</h2>
          <DaoDirectoryList entries={featured} />
        </section>

        <section className="daos-index-section" aria-label="Discover DAOs">
          <h2 className="daos-index-heading">Discover</h2>
          <button
            type="button"
            className="daos-discover-open"
            onClick={() => setDiscoverOpen(true)}
          >
            <span className="daos-discover-open-title">Browse all DAOs</span>
            <span className="daos-discover-open-copy">
              Search the Sputnik factory catalog — square crests, same list
              language as Standing.
            </span>
          </button>
        </section>

        {recentEntries.length > 0 ? (
          <section
            className="daos-index-section"
            aria-label="Recent community DAOs"
          >
            <h2 className="daos-index-heading">Recent</h2>
            <DaoDirectoryList entries={recentEntries} />
          </section>
        ) : null}
      </div>

      <DaoDiscoverSheet
        open={discoverOpen}
        onClose={() => setDiscoverOpen(false)}
      />
    </OsAppScreen>
  );
}
