'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { MarketListingRow } from '@/features/market/market-listing-row';
import {
  fetchMarketListings,
  fetchMarketSales,
  fetchOwnedScarces,
  marketListingRowKey,
  type MarketListingItem,
  type MarketSaleItem,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import { MarketOwnedRow } from '@/features/market/market-owned-row';
import {
  ScarceBuySheet,
  type ScarceBuyListing,
} from '@/features/scarces/scarce-buy-sheet';
import {
  postScarceKey,
  setScarceEmbedOverride,
} from '@/features/scarces/scarce-embed-ledger';
import { ScarceSellSheet } from '@/features/scarces/scarce-sell-sheet';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import { accountIdsEqual } from '@/lib/account-match';
import { APP_HOME_PATH } from '@/lib/app-routes';
import { portfolioPath } from '@/lib/overlay-routes';
import { fallbackLabel } from '@/lib/profile-display';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

type LoadStatus = 'loading' | 'ready' | 'error';

interface MarketPageData {
  key: number;
  listings: MarketListingItem[];
  sales: MarketSaleItem[];
  owned: OwnedScarceItem[];
}

function sourcePostCoords(
  path: string | undefined
): { author: string; postId: string } | null {
  if (!path?.trim()) return null;
  const match = path.trim().match(/^(.+)\/post\/(.+)$/);
  if (!match?.[1] || !match[2]) return null;
  return { author: match[1], postId: match[2] };
}

export function MarketPagePanel() {
  const { accountId: viewerAccountId, getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [retryKey, setRetryKey] = useState(0);
  const [data, setData] = useState<MarketPageData | null>(null);
  const [failedKey, setFailedKey] = useState<number | null>(null);
  const [buyListing, setBuyListing] = useState<ScarceBuyListing | null>(null);
  const [sellItem, setSellItem] = useState<OwnedScarceItem | null>(null);
  const [cancelRowKey, setCancelRowKey] = useState<string | null>(null);
  const [delistTokenId, setDelistTokenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchMarketListings(),
      fetchMarketSales(),
      viewerAccountId
        ? fetchOwnedScarces(viewerAccountId)
        : Promise.resolve([] as OwnedScarceItem[]),
    ])
      .then(([listings, sales, owned]) => {
        if (cancelled) return;
        setData({ key: retryKey, listings, sales, owned });
      })
      .catch(() => {
        if (cancelled) return;
        setFailedKey(retryKey);
      });
    return () => {
      cancelled = true;
    };
  }, [retryKey, viewerAccountId]);

  const status: LoadStatus =
    data?.key === retryKey
      ? 'ready'
      : failedKey === retryKey
        ? 'error'
        : 'loading';
  const listings = data?.key === retryKey ? data.listings : [];
  const sales = data?.key === retryKey ? data.sales : [];
  const owned = data?.key === retryKey ? data.owned : [];

  const handleBuy = useCallback(
    (item: MarketListingItem) => {
      if (
        viewerAccountId &&
        accountIdsEqual(viewerAccountId, item.creatorId)
      ) {
        return;
      }
      if (item.kind === 'native' && item.tokenId) {
        setBuyListing({
          tokenId: item.tokenId,
          status: 'listed',
          priceNear: item.priceNear,
          title: item.title,
          mediaUrl: item.mediaUrl,
          creatorId: item.creatorId,
        });
        return;
      }
      if (!item.listingId) return;
      setBuyListing({
        listingId: item.listingId,
        status: 'lazy_listing',
        priceNear: item.priceNear,
        title: item.title,
        mediaUrl: item.mediaUrl,
        creatorId: item.creatorId,
        copies: item.copies,
        remaining: item.remaining,
      });
    },
    [viewerAccountId]
  );

  const handlePurchased = useCallback(() => {
    setBuyListing(null);
    setRetryKey((value) => value + 1);
  }, []);

  const handleListed = useCallback(() => {
    setSellItem(null);
    setRetryKey((value) => value + 1);
  }, []);

  const handleCancel = useCallback(
    async (item: MarketListingItem) => {
      const rowKey = marketListingRowKey(item);
      if (cancelRowKey) return;
      setCancelRowKey(rowKey);
      try {
        const { accountId, wallet } = await getSigningWallet();
        const client = createAppScarcesWalletClient(accountId, wallet);
        const response =
          item.kind === 'native' && item.tokenId
            ? await client.scarces.market.delist(item.tokenId)
            : item.listingId
              ? await client.scarces.lazy.cancel(item.listingId)
              : null;
        if (!response) return;

        const confirmed = await trackTransaction({
          txHashes: collectRelayTxHashes(response),
          submittedMessage: txToastConfirming.cancelingScarceListing,
          successMessage: txToastSuccess.scarceListingCanceled,
          failureMessage: txToastError.cancelScarceListingFailed,
        });
        if (!confirmed) return;

        setData((current) =>
          current
            ? {
                ...current,
                listings: current.listings.filter(
                  (row) => marketListingRowKey(row) !== rowKey
                ),
                owned: current.owned.map((row) =>
                  item.tokenId && row.tokenId === item.tokenId
                    ? { ...row, listedPriceNear: null }
                    : row
                ),
              }
            : current
        );

        const coords = sourcePostCoords(item.sourcePostPath);
        if (coords && item.kind === 'lazy') {
          setScarceEmbedOverride(
            postScarceKey(coords.author, coords.postId),
            { status: 'none', events: [] }
          );
        }
      } catch (cause) {
        if (isWalletUserCancellation(cause)) return;
        setTxResult({
          type: 'error',
          msg:
            cause instanceof Error
              ? cause.message
              : txToastError.cancelScarceListingFailed,
        });
      } finally {
        setCancelRowKey(null);
      }
    },
    [cancelRowKey, getSigningWallet, setTxResult, trackTransaction]
  );

  const handleDelistOwned = useCallback(
    async (item: OwnedScarceItem) => {
      if (delistTokenId) return;
      setDelistTokenId(item.tokenId);
      try {
        const { accountId, wallet } = await getSigningWallet();
        const client = createAppScarcesWalletClient(accountId, wallet);
        const response = await client.scarces.market.delist(item.tokenId);
        const confirmed = await trackTransaction({
          txHashes: collectRelayTxHashes(response),
          submittedMessage: txToastConfirming.cancelingScarceListing,
          successMessage: txToastSuccess.scarceListingCanceled,
          failureMessage: txToastError.cancelScarceListingFailed,
        });
        if (!confirmed) return;
        setRetryKey((value) => value + 1);
      } catch (cause) {
        if (isWalletUserCancellation(cause)) return;
        setTxResult({
          type: 'error',
          msg:
            cause instanceof Error
              ? cause.message
              : txToastError.cancelScarceListingFailed,
        });
      } finally {
        setDelistTokenId(null);
      }
    },
    [delistTokenId, getSigningWallet, setTxResult, trackTransaction]
  );

  const showEmptyBrowse =
    status === 'ready' && listings.length === 0 && owned.length === 0;

  return (
    <OsAppScreen
      title="Market"
      subtitle="Scarces for sale"
      backFallbackHref={APP_HOME_PATH}
    >
      <div className="market-page">
        {status === 'loading' ? (
          <p className="market-page-status">Loading listings…</p>
        ) : null}
        {status === 'error' ? (
          <p className="market-page-status">
            Couldn’t load Market.{' '}
            <button
              type="button"
              className="market-page-retry"
              onClick={() => setRetryKey((value) => value + 1)}
            >
              Retry
            </button>
          </p>
        ) : null}

        {showEmptyBrowse ? (
          <div className="market-page-empty">
            <p className="market-page-empty-copy">
              No scarces listed yet. List from a post you wrote, or buy one and
              sell it here.
            </p>
            <Link className="app-soon-link" href={APP_HOME_PATH}>
              Back to Home
            </Link>
          </div>
        ) : null}

        {viewerAccountId && owned.length > 0 ? (
          <section className="market-section" aria-labelledby="market-yours">
            <h2 id="market-yours" className="market-section-title">
              Yours
            </h2>
            <div className="market-listing-list">
              {owned.map((item) => (
                <MarketOwnedRow
                  key={item.tokenId}
                  item={item}
                  delistPending={delistTokenId === item.tokenId}
                  onSell={setSellItem}
                  onDelist={(row) => {
                    void handleDelistOwned(row);
                  }}
                />
              ))}
            </div>
          </section>
        ) : null}

        {listings.length > 0 ? (
          <section className="market-section" aria-labelledby="market-new">
            <h2 id="market-new" className="market-section-title">
              New listings
            </h2>
            <div className="market-listing-list">
              {listings.map((item) => {
                const rowKey = marketListingRowKey(item);
                return (
                  <MarketListingRow
                    key={rowKey}
                    item={item}
                    isOwnListing={
                      Boolean(viewerAccountId) &&
                      accountIdsEqual(viewerAccountId!, item.creatorId)
                    }
                    cancelPending={cancelRowKey === rowKey}
                    onBuy={handleBuy}
                    onCancel={(row) => {
                      void handleCancel(row);
                    }}
                  />
                );
              })}
            </div>
          </section>
        ) : null}

        {sales.length > 0 ? (
          <section className="market-section" aria-labelledby="market-sales">
            <h2 id="market-sales" className="market-section-title">
              Recent sales
            </h2>
            <ul className="market-sales-list">
              {sales.map((sale, index) => {
                const seller =
                  sale.sellerId?.trim() || sale.creatorId?.trim() || '';
                return (
                  <li
                    key={`${sale.listingId ?? sale.tokenId ?? 'sale'}:${sale.blockTimestamp}:${index}`}
                    className="market-sale-row"
                  >
                    <span className="market-sale-title">{sale.title}</span>
                    <span className="market-sale-meta">
                      {sale.priceNear} NEAR
                      {seller ? (
                        <>
                          {' · '}
                          <Link
                            href={portfolioPath(seller)}
                            scroll={false}
                            className="market-listing-handle"
                          >
                            @{fallbackLabel(seller)}
                          </Link>
                        </>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>

      <ScarceBuySheet
        open={buyListing != null}
        listing={buyListing}
        onOpenChange={(open) => {
          if (!open) setBuyListing(null);
        }}
        onPurchased={handlePurchased}
      />

      <ScarceSellSheet
        open={sellItem != null}
        item={sellItem}
        sellerAccountId={viewerAccountId}
        onOpenChange={(open) => {
          if (!open) setSellItem(null);
        }}
        onListed={handleListed}
      />
    </OsAppScreen>
  );
}
