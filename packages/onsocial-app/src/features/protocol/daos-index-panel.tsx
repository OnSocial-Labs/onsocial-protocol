'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Divider, OsIconAction, PlusIcon, SearchIcon } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { DaoCreateSheet } from '@/features/protocol/dao-create-sheet';
import { DaosExplorePanel } from '@/features/protocol/daos-explore-panel';
import { daoDirectoryEntryFromMembership } from '@/features/protocol/dao-directory';
import type { DaoDirectoryEntry } from '@/features/protocol/dao-directory';
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

function DaoMineCard({ entry }: { entry: DaoDirectoryEntry }) {
  const named = entry.name.trim().toLowerCase() !== entry.accountId;
  const title = named ? entry.name : entry.accountId;
  return (
    <Link
      href={entry.href}
      className="daos-mine-card"
      scroll={false}
      aria-label={named ? entry.name : `@${entry.accountId}`}
    >
      <span className="daos-mine-crest" aria-hidden>
        {entry.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entry.avatarUrl} alt="" />
        ) : (
          <span className="daos-mine-crest-fallback">
            {title.slice(0, 2).toUpperCase()}
          </span>
        )}
      </span>
      <span className="daos-mine-card-copy">
        <span className="daos-mine-card-title">{title}</span>
        <span className="daos-mine-card-meta">{entry.kindLabel}</span>
      </span>
    </Link>
  );
}

/**
 * DAOs launcher — one Home: mine (horizontal) + proposals under a divider.
 * Network catalog find: header search → Discover → DAOs.
 */
export function DaosIndexPanel() {
  const { accountId } = useAppWallet();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [myDaos, setMyDaos] = useState<MyDaoMembership[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const discoverDaosHref = appDiscoverTabHref('daos');

  useEffect(() => {
    const wantsCreate =
      searchParams.get(DAOS_CREATE_QUERY) === '1' ||
      searchParams.get(DAOS_CREATE_QUERY) === 'true';
    if (!wantsCreate) return;
    queueMicrotask(() => setCreateOpen(true));
    const params = new URLSearchParams(searchParams.toString());
    params.delete(DAOS_CREATE_QUERY);
    params.delete('tab');
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
  const showMineRail = Boolean(accountId && myDaosReady && myEntries.length > 0);
  /** Proposals only once you're in — no tutorial empty under the divider. */
  const showProposals = showMineRail;

  const headerActions = (
    <>
      <OsIconAction asChild ariaLabel="Discover DAOs">
        <Link href={discoverDaosHref} scroll={false}>
          <SearchIcon aria-hidden className="glass-sheet-close-icon" />
        </Link>
      </OsIconAction>
      <OsIconAction
        ariaLabel="Create DAO"
        aria-expanded={createOpen}
        aria-haspopup="dialog"
        onClick={() => setCreateOpen(true)}
      >
        <PlusIcon aria-hidden className="glass-sheet-close-icon" />
      </OsIconAction>
    </>
  );

  return (
    <OsAppScreen
      title="DAOs"
      subtitle="Your orgs"
      backFallbackHref="/"
      glassChrome
      actions={headerActions}
    >
      <div className="daos-index">
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

        <section className="daos-index-section" aria-label="My DAOs">
          <h2 className="daos-index-heading">My DAOs</h2>
          {!accountId ? (
            <p className="daos-index-empty">
              Connect to see DAOs you’ve joined — or search the Near network.
            </p>
          ) : !myDaosReady ? (
            <p className="daos-index-empty">Loading your DAOs…</p>
          ) : myEntries.length === 0 ? (
            <p className="daos-index-empty">
              You haven’t joined a DAO yet. Tap + to start one, or search to
              find your people.
            </p>
          ) : (
            <div className="daos-mine-rail" role="list">
              {myEntries.map((entry) => (
                <div key={entry.accountId} role="listitem">
                  <DaoMineCard entry={entry} />
                </div>
              ))}
            </div>
          )}
        </section>

        {showProposals ? (
          <>
            <Divider className="daos-index-divider" />

            <section className="daos-index-section" aria-label="Proposals">
              <h2 className="daos-index-heading">Proposals</h2>
              <DaosExplorePanel accountId={accountId} myDaos={myDaos} />
            </section>
          </>
        ) : null}
      </div>

      <DaoCreateSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </OsAppScreen>
  );
}
