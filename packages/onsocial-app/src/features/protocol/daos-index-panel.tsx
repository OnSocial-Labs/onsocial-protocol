'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { OsIconAction, PlusIcon } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  PROTOCOL_COMMUNITY_DAO_SEED,
  readRecentCommunityDaos,
} from '@/features/protocol/dao-accounts';
import { DaoCreateSheet } from '@/features/protocol/dao-create-sheet';
import {
  daoDirectoryEntryFromMembership,
  daoDirectoryEntryFromRecent,
  daoDirectoryEntryFromSeed,
} from '@/features/protocol/dao-directory';
import { DaoDirectoryList } from '@/features/protocol/dao-directory-row';
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
import { APP_DISCOVER_PATH, daoPath } from '@/lib/app-routes';
import { applyDiscoverTabParam } from '@/features/discover/discover-tabs';

const MY_DAOS_SOFT_RETRY_MS = 2500;

function discoverDaosHref(): string {
  const params = new URLSearchParams();
  applyDiscoverTabParam(params, 'daos');
  const qs = params.toString();
  return qs ? `${APP_DISCOVER_PATH}?${qs}` : APP_DISCOVER_PATH;
}

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
  const [createOpen, setCreateOpen] = useState(false);

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

  const createAction = (
    <OsIconAction
      ariaLabel="Create DAO"
      aria-expanded={createOpen}
      aria-haspopup="dialog"
      onClick={() => setCreateOpen(true)}
    >
      <PlusIcon aria-hidden className="glass-sheet-close-icon" />
    </OsIconAction>
  );

  return (
    <OsAppScreen
      title="DAOs"
      subtitle="Org homes — cover, crest, proposals"
      backFallbackHref="/"
      glassChrome
      actions={createAction}
    >
      <div className="daos-index">
        <p className="daos-index-lede">
          Each DAO has a portfolio — cover, square crest, and About. Tap + to
          create on the factory; Discover browses every listed DAO.
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
                empty="No DAO roles yet. Tap + to create one, or open a portfolio — memberships appear here as roles sync."
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
          <Link href={discoverDaosHref()} className="daos-discover-open">
            <span className="daos-discover-open-title">Browse all DAOs</span>
            <span className="daos-discover-open-copy">
              Search the Sputnik factory catalog in Discover — square crests,
              same list language as Standing.
            </span>
          </Link>
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

      <DaoCreateSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </OsAppScreen>
  );
}
