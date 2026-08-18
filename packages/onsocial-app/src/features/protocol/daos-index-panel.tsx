'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { OsIconAction, PlusIcon } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { DaoCreateSheet } from '@/features/protocol/dao-create-sheet';
import { daoDirectoryEntryFromMembership } from '@/features/protocol/dao-directory';
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
import { DAOS_CREATE_QUERY, daoPath } from '@/lib/app-routes';
import { appDiscoverTabHref } from '@/features/discover/discover-tabs';
import { useRouter, useSearchParams } from 'next/navigation';

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

/**
 * Thin DAOs home — My DAOs + Create.
 * Browse lives in Discover; Protocol opens Governance (switch Treasury on face).
 * Trending / latest proposals can land here later.
 */
export function DaosIndexPanel() {
  const { accountId, connect, isConnected } = useAppWallet();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [myDaos, setMyDaos] = useState<MyDaoMembership[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const wantsCreate =
      searchParams.get(DAOS_CREATE_QUERY) === '1' ||
      searchParams.get(DAOS_CREATE_QUERY) === 'true';
    if (!wantsCreate) return;
    queueMicrotask(() => setCreateOpen(true));
    const params = new URLSearchParams(searchParams.toString());
    params.delete(DAOS_CREATE_QUERY);
    const qs = params.toString();
    router.replace(qs ? `/daos?${qs}` : '/daos', { scroll: false });
  }, [router, searchParams]);

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

  const myDaosReady = myDaos !== null;
  const discoverDaosHref = appDiscoverTabHref('daos');

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
      subtitle="Your orgs — create or open"
      backFallbackHref="/"
      glassChrome
      actions={createAction}
    >
      <div className="daos-index">
        <p className="daos-index-lede">
          Memberships you hold. Browse every factory DAO in Discover; Protocol
          opens OnSocial Governance (switch to Treasury on the face).
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
          <Link href={discoverDaosHref} className="daos-index-chip">
            Discover
          </Link>
        </div>

        <section className="daos-index-section" aria-label="My DAOs">
          <h2 className="daos-index-heading">My DAOs</h2>
          {!accountId ? (
            <div className="standing-panel-empty-block">
              <div className="standing-panel-empty-state">
                <p className="standing-panel-empty-primary">
                  Connect to see your DAO roles.
                </p>
                <p className="standing-panel-empty-secondary">
                  Or browse the catalog in Discover.
                </p>
              </div>
              <div className="standing-panel-empty-actions">
                {!isConnected ? (
                  <button
                    type="button"
                    className="standing-panel-empty-action"
                    onClick={() => void connect()}
                  >
                    Connect wallet
                  </button>
                ) : null}
                <Link
                  className="standing-panel-empty-action"
                  href={discoverDaosHref}
                >
                  Browse DAOs
                </Link>
              </div>
            </div>
          ) : !myDaosReady ? (
            <p className="daos-index-empty">Loading memberships…</p>
          ) : (
            <DaoDirectoryList
              entries={myEntries}
              empty="No DAO roles yet. Tap + to create one — memberships appear here as roles sync."
            />
          )}
        </section>
      </div>

      <DaoCreateSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </OsAppScreen>
  );
}
