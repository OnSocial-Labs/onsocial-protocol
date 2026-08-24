'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { CollectiblesHoldingRow } from '@/features/collectibles/collectibles-holding-row';
import { CollectiblesHoldingRowMenu } from '@/features/collectibles/collectibles-holding-row-menu';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import {
  fetchOwnedScarcesPage,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import { invalidateOwnedVaultCache } from '@/features/market/owned-vault-cache';
import { ScarceSellSheet } from '@/features/scarces/scarce-sell-sheet';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { accountIdsEqual } from '@/lib/account-match';
import { portfolioCollectiblesPath } from '@/lib/overlay-routes';
import {
  groupHoldingsForRail,
  PAGE_DRAWER_COLLECTION_PREVIEW_ROWS,
  toPortfolioHoldingPeek,
  type PortfolioHoldingPeek,
} from '@/lib/portfolio-holdings';

/** First owned page for the drawer preview — full vault is PanelPage collectibles. */
const PAGE_DRAWER_COLLECTION_FETCH = 24;

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
 * Collection tab — grouped use-first rows (Collectibles parity) and a vault
 * handoff when the preview is truncated or for search and filters.
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

  const ownedByToken = useMemo(() => {
    const map = new Map<string, OwnedScarceItem>();
    for (const row of state.owned) {
      map.set(row.tokenId, row);
    }
    return map;
  }, [state.owned]);

  const grouped = useMemo(
    () => groupHoldingsForRail(state.items),
    [state.items]
  );
  const previewRows = grouped.slice(0, PAGE_DRAWER_COLLECTION_PREVIEW_ROWS);
  const previewTruncated = grouped.length > PAGE_DRAWER_COLLECTION_PREVIEW_ROWS;
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
      <div className="page-drawer-section">
        <p className="page-drawer-section-empty">Nothing held yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-drawer-section">
        <section className="market-section" aria-labelledby="page-drawer-collection">
          <h3 id="page-drawer-collection" className="market-section-title">
            Collection
          </h3>
          {loading ? <MarketListSkeleton rows={3} /> : null}
          {!loading && previewRows.length > 0 ? (
            <div className="market-listing-list" role="list">
              {previewRows.map((item) => {
                const owned = ownedByToken.get(item.tokenId);
                return (
                  <CollectiblesHoldingRow
                    key={item.tokenId}
                    item={item}
                    editionCount={item.editionCount}
                    ownerMenu={
                      isSelf && owned ? (
                        <CollectiblesHoldingRowMenu
                          item={owned}
                          onList={() => {
                            setSellItem(owned);
                            setSellOpen(true);
                          }}
                          onDelisted={refreshOwned}
                        />
                      ) : null
                    }
                  />
                );
              })}
            </div>
          ) : null}
          {!loading && showSeeAll ? (
            <Link
              href={seeAllHref}
              scroll={false}
              className="page-drawer-section-action"
            >
              {seeAllCopy.action} · {seeAllCopy.count}
              <ProtocolMotionArrow className="page-drawer-section-action-arrow" />
            </Link>
          ) : null}
        </section>
      </div>

      <ScarceSellSheet
        open={sellOpen && sellItem != null}
        item={sellItem}
        sellerAccountId={viewerAccountId}
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
    </>
  );
}
