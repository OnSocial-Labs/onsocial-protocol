'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { CollectiblesHoldingRowMenu } from '@/features/collectibles/collectibles-holding-row-menu';
import { CollectiblesLibrarySkeleton } from '@/features/collectibles/collectibles-library-skeleton';
import { CollectiblesVaultLibrary } from '@/features/collectibles/collectibles-vault-library';
import { OsRowAction } from '@/lib/os-row-action';
import {
  fetchOwnedScarcesPage,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import { invalidateOwnedVaultCache } from '@/features/market/owned-vault-cache';
import {
  fetchCollectionCreatorFaces,
  type CollectionCreatorFace,
} from '@/features/scarces/collection-creator-face';
import { sheetZIndexOverCopyList } from '@/features/collectibles/edition-sheet-stack';
import { ScarceSellSheet } from '@/features/scarces/scarce-sell-sheet';
import { ScarceTransferSheet } from '@/features/scarces/scarce-transfer-sheet';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { accountIdsEqual } from '@/lib/account-match';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { portfolioCollectiblesPath } from '@/lib/overlay-routes';
import {
  countLibraryDrops,
  groupHoldingsLibrary,
  PAGE_DRAWER_COLLECTION_PREVIEW_ROWS,
  sliceLibraryGroups,
  toPortfolioHoldingPeek,
  type PortfolioHoldingPeek,
} from '@/lib/portfolio-holdings';

/** First owned page for the drawer preview — full vault is PanelPage collectibles. */
const PAGE_DRAWER_COLLECTION_FETCH = 24;
const EMPTY_CREATOR_FACES = new Map<string, CollectionCreatorFace>();

interface CollectionState {
  items: PortfolioHoldingPeek[];
  owned: OwnedScarceItem[];
  hasMore: boolean;
  status: 'seed' | 'loading' | 'ready' | 'error';
}

function resolveCollectionSeeAllCopy(
  tokenCount: number,
  hasMore: boolean,
  previewTruncated: boolean,
  pageSize: number
): { action: string; count: string } {
  const inventoryContinues =
    previewTruncated || (hasMore && tokenCount >= pageSize);
  return {
    action: inventoryContinues ? 'See all' : 'Open vault',
    count: inventoryContinues ? `${tokenCount}+` : String(tokenCount),
  };
}

/**
 * Collectibles tab — grouped use-first rows and a vault handoff when the
 * preview is truncated or for search and filters.
 */
export function PageDrawerCollectionList({
  pageAccountId,
  initialHoldings,
}: {
  pageAccountId: string;
  initialHoldings: PortfolioHoldingPeek[];
}) {
  const { accountId: viewerAccountId } = useAppWallet();
  const isSelf =
    Boolean(viewerAccountId) &&
    accountIdsEqual(viewerAccountId!, pageAccountId);
  const [state, setState] = useState<CollectionState>({
    items: initialHoldings,
    owned: [],
    hasMore: false,
    status: initialHoldings.length > 0 ? 'seed' : 'loading',
  });
  const [loadedAccountId, setLoadedAccountId] = useState<string | null>(null);
  const [sellItem, setSellItem] = useState<OwnedScarceItem | null>(null);
  const [sellOpen, setSellOpen] = useState(false);
  const [editionListOpen, setEditionListOpen] = useState(false);
  const [transferItem, setTransferItem] = useState<OwnedScarceItem | null>(
    null
  );
  const [transferOpen, setTransferOpen] = useState(false);
  const [creatorFaceLoad, setCreatorFaceLoad] = useState<{
    key: string;
    faces: Map<string, CollectionCreatorFace>;
  } | null>(null);

  const refreshOwned = useCallback(() => {
    void fetchOwnedScarcesPage(pageAccountId, {
      pageSize: PAGE_DRAWER_COLLECTION_FETCH,
      bypassCache: true,
    }).then((page) => {
      setState({
        items: page.items.map(toPortfolioHoldingPeek),
        owned: page.items,
        hasMore: page.hasMore,
        status: 'ready',
      });
    });
    if (viewerAccountId) invalidateOwnedVaultCache(viewerAccountId);
  }, [pageAccountId, viewerAccountId]);

  useEffect(() => {
    let cancelled = false;
    void fetchOwnedScarcesPage(pageAccountId, {
      pageSize: PAGE_DRAWER_COLLECTION_FETCH,
    })
      .then((page) => {
        if (cancelled) return;
        setState({
          items: page.items.map(toPortfolioHoldingPeek),
          owned: page.items,
          hasMore: page.hasMore,
          status: 'ready',
        });
        setLoadedAccountId(pageAccountId);
      })
      .catch(() => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, status: 'error' }));
        setLoadedAccountId(pageAccountId);
      });
    return () => {
      cancelled = true;
    };
  }, [pageAccountId]);

  const fetchingAccount = loadedAccountId !== pageAccountId;

  const creatorIdsKey = useMemo(() => {
    const ids = [
      ...new Set(
        state.items
          .map((item) => item.creatorId?.trim())
          .filter((id): id is string => Boolean(id))
      ),
    ].sort();
    return ids.join('|');
  }, [state.items]);

  useEffect(() => {
    if (!creatorIdsKey) return;
    let cancelled = false;
    void fetchCollectionCreatorFaces(
      createReadOnlyOnSocialClient(),
      creatorIdsKey.split('|')
    ).then((faces) => {
      if (!cancelled) setCreatorFaceLoad({ key: creatorIdsKey, faces });
    });
    return () => {
      cancelled = true;
    };
  }, [creatorIdsKey]);

  const creatorFaces =
    creatorIdsKey && creatorFaceLoad?.key === creatorIdsKey
      ? creatorFaceLoad.faces
      : EMPTY_CREATOR_FACES;

  const ownedByToken = useMemo(() => {
    const map = new Map<string, OwnedScarceItem>();
    for (const row of state.owned) {
      map.set(row.tokenId, row);
    }
    return map;
  }, [state.owned]);

  const library = useMemo(() => {
    const groups = groupHoldingsLibrary(state.items);
    return sliceLibraryGroups(groups, PAGE_DRAWER_COLLECTION_PREVIEW_ROWS);
  }, [state.items]);
  const previewRows = countLibraryDrops(library.groups);
  const previewTruncated = library.truncated;
  const seeAllHref = portfolioCollectiblesPath(pageAccountId);
  const showSeeAll = state.items.length > 0;
  const seeAllCopy = resolveCollectionSeeAllCopy(
    state.items.length,
    state.hasMore,
    previewTruncated,
    PAGE_DRAWER_COLLECTION_FETCH
  );
  const loading =
    (fetchingAccount || state.status === 'loading') &&
    state.items.length === 0 &&
    initialHoldings.length === 0;

  if (
    state.status === 'ready' &&
    state.items.length === 0 &&
    initialHoldings.length === 0
  ) {
    return (
      <div className="page-drawer-section is-vault">
        <p className="page-drawer-section-empty">Nothing held yet.</p>
      </div>
    );
  }

  return (
    <>
      <section
        className="page-drawer-section is-vault"
        aria-label="Collectibles"
      >
        {loading ? <CollectiblesLibrarySkeleton /> : null}
        {!loading && previewRows > 0 ? (
          <CollectiblesVaultLibrary
            embedded
            groups={library.groups}
            ownedByToken={ownedByToken}
            creatorFaces={creatorFaces}
            showCreatorHeadings={library.groups.length > 1}
            renderOwnerMenu={
              isSelf
                ? (owned) => (
                    <CollectiblesHoldingRowMenu
                      item={owned}
                      onList={() => {
                        setSellItem(owned);
                        setSellOpen(true);
                      }}
                      onTransfer={() => {
                        setTransferItem(owned);
                        setTransferOpen(true);
                      }}
                      onDelisted={refreshOwned}
                    />
                  )
                : undefined
            }
            onTransferEdition={
              isSelf
                ? (owned) => {
                    setTransferItem(owned);
                    setTransferOpen(true);
                  }
                : undefined
            }
            onSellEdition={
              isSelf
                ? (owned) => {
                    setSellItem(owned);
                    setSellOpen(true);
                  }
                : undefined
            }
            onEditionListOpenChange={setEditionListOpen}
          />
        ) : null}
        {!loading && showSeeAll ? (
          <OsRowAction href={seeAllHref}>
            {seeAllCopy.action} · {seeAllCopy.count}
            <ProtocolMotionArrow className="os-row-action-arrow" />
          </OsRowAction>
        ) : null}
      </section>

      <ScarceSellSheet
        open={sellOpen && sellItem != null}
        item={sellItem}
        sellerAccountId={viewerAccountId}
        zIndex={sheetZIndexOverCopyList(editionListOpen)}
        onOpenChange={(open) => {
          setSellOpen(open);
          if (!open) setSellItem(null);
        }}
        onListed={() => {
          setSellOpen(false);
          setSellItem(null);
          refreshOwned();
        }}
      />

      <ScarceTransferSheet
        open={transferOpen && transferItem != null}
        item={transferItem}
        ownerAccountId={viewerAccountId}
        zIndex={sheetZIndexOverCopyList(editionListOpen)}
        onOpenChange={(open) => {
          setTransferOpen(open);
          if (!open) setTransferItem(null);
        }}
        onTransferred={() => {
          setTransferOpen(false);
          setTransferItem(null);
          refreshOwned();
        }}
      />
    </>
  );
}
