'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageDrawerCreatedRail } from '@/components/portfolio/page-drawer-peeks';
import { PortfolioDropRow } from '@/components/portfolio/portfolio-drop-row';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import {
  mergeDropFanRoster,
  useDropFanRosters,
} from '@/hooks/use-drop-fan-rosters';
import { useScarceCollectionSaves } from '@/hooks/use-scarce-collection-saves';
import {
  deriveCollectionStatus,
  fetchCollectionsByCreator,
} from '@/features/scarces/collections-data';
import { collectionToProfileStoreDrop } from '@/lib/profile-store-map';
import type { ProfileCreatedPeek } from '@/lib/fetch-profile-peeks';
import type { ProfileStoreDrop } from '@/lib/profile-store-types';

const WORKS_CATALOG_PAGE = 48;

/** Full created catalog — every collection status, sold out included. */
export function PageDrawerWorksCatalog({
  pageAccountId,
  profileName,
  avatarUrl,
  createdPeeks,
}: {
  pageAccountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  createdPeeks: ProfileCreatedPeek[];
}) {
  const { setTxResult } = useAppTransactionFeedback();
  const [drops, setDrops] = useState<ProfileStoreDrop[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );

  useEffect(() => {
    let cancelled = false;
    void fetchCollectionsByCreator(pageAccountId, { limit: WORKS_CATALOG_PAGE })
      .then((collections) => {
        if (cancelled) return;
        setDrops(
          collections
            .filter(
              (collection) => deriveCollectionStatus(collection) !== 'cancelled'
            )
            .map(collectionToProfileStoreDrop)
        );
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [pageAccountId]);

  const fanRosters = useDropFanRosters(drops.map((drop) => drop.collectionId));
  const catalogDrops = useMemo(
    () =>
      drops.map((drop) =>
        mergeDropFanRoster(drop, fanRosters.get(drop.collectionId.trim()))
      ),
    [drops, fanRosters]
  );
  const catalogCollectionIds = useMemo(
    () => catalogDrops.map((drop) => drop.collectionId),
    [catalogDrops]
  );
  const { viewerSaved, isSavePending, toggleSave } = useScarceCollectionSaves({
    collectionIds: catalogCollectionIds,
    onError: (message) => setTxResult({ type: 'error', msg: message }),
  });

  const handleDropOwnerManaged = (
    collectionId: string,
    change: 'paused' | 'resumed' | 'deleted'
  ) => {
    if (change === 'deleted' || change === 'paused') {
      setDrops((current) =>
        current.filter((drop) => drop.collectionId !== collectionId)
      );
    }
  };

  if (status === 'loading' && drops.length === 0 && createdPeeks.length === 0) {
    return null;
  }

  const hasCatalog = catalogDrops.length > 0;
  const hasCreated = createdPeeks.length > 0;

  if (!hasCatalog && !hasCreated) {
    return (
      <p className="page-drawer-section-empty">No scarces published yet.</p>
    );
  }

  return (
    <div className="page-drawer-peek-stack">
      {hasCatalog ? (
        <div className="market-listing-list" role="list" aria-label="All works">
          {catalogDrops.map((drop) => (
            <PortfolioDropRow
              key={drop.key}
              pageAccountId={pageAccountId}
              displayName={profileName}
              avatarUrl={avatarUrl}
              drop={drop}
              saved={viewerSaved(drop.collectionId)}
              savePending={isSavePending(drop.collectionId)}
              onToggleSave={() => {
                void toggleSave(drop.collectionId);
              }}
              onOwnerManaged={(change) => {
                handleDropOwnerManaged(drop.collectionId, change);
              }}
            />
          ))}
        </div>
      ) : null}
      {hasCreated ? <PageDrawerCreatedRail created={createdPeeks} /> : null}
    </div>
  );
}
