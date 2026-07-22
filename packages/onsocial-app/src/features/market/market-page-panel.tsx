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
  ScarceBidSheet,
  type ScarceBidListing,
} from '@/features/scarces/scarce-bid-sheet';
import {
  ScarceBuySheet,
  type ScarceBuyListing,
} from '@/features/scarces/scarce-buy-sheet';
import {
  postScarceKey,
  setScarceEmbedOverride,
} from '@/features/scarces/scarce-embed-ledger';
import {
  ScarceOfferSheet,
  type ScarceOfferListing,
} from '@/features/scarces/scarce-offer-sheet';
import { fetchOffersForToken } from '@/features/scarces/scarce-offers';
import { ScarceOffersSheet } from '@/features/scarces/scarce-offers-sheet';
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
type ListingFilter = 'all' | 'fixed' | 'auctions';

const LISTING_FILTERS: { id: ListingFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'fixed', label: 'Fixed' },
  { id: 'auctions', label: 'Auctions' },
];

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
  const [bidListing, setBidListing] = useState<ScarceBidListing | null>(null);
  const [offerListing, setOfferListing] = useState<ScarceOfferListing | null>(
    null
  );
  const [sellItem, setSellItem] = useState<OwnedScarceItem | null>(null);
  const [offersItem, setOffersItem] = useState<OwnedScarceItem | null>(null);
  const [cancelRowKey, setCancelRowKey] = useState<string | null>(null);
  const [delistTokenId, setDelistTokenId] = useState<string | null>(null);
  const [listingFilter, setListingFilter] = useState<ListingFilter>('all');
  const [offerCounts, setOfferCounts] = useState<Record<string, number>>({});

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

  const filteredListings =
    listingFilter === 'auctions'
      ? listings.filter((item) => item.kind === 'auction')
      : listingFilter === 'fixed'
        ? listings.filter((item) => item.kind !== 'auction')
        : listings;

  const ownedTokenIds = owned.map((item) => item.tokenId).join('\0');

  useEffect(() => {
    if (!viewerAccountId || !ownedTokenIds) {
      setOfferCounts({});
      return;
    }
    const tokenIds = ownedTokenIds.split('\0');
    let cancelled = false;
    void Promise.all(
      tokenIds.map(async (tokenId) => {
        const offers = await fetchOffersForToken(tokenId);
        return [tokenId, offers.length] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      setOfferCounts(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [viewerAccountId, ownedTokenIds, retryKey]);

  const handleBuy = useCallback(
    (item: MarketListingItem) => {
      if (
        viewerAccountId &&
        accountIdsEqual(viewerAccountId, item.creatorId)
      ) {
        return;
      }
      if (item.kind === 'auction' && item.tokenId) {
        setBidListing({
          tokenId: item.tokenId,
          title: item.title,
          mediaUrl: item.mediaUrl,
          sellerId: item.creatorId,
          priceNear: item.priceNear,
        });
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

  const handleBid = useCallback(() => {
    setBidListing(null);
    setRetryKey((value) => value + 1);
  }, []);

  const handleOffered = useCallback(() => {
    setOfferListing(null);
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
          item.kind === 'auction' && item.tokenId
            ? await client.scarces.auctions.cancel(item.tokenId)
            : item.kind === 'native' && item.tokenId
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
  const showEmptyFilter =
    status === 'ready' &&
    listings.length > 0 &&
    filteredListings.length === 0;

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
              Nothing listed yet. List a scarce from a post, or sell one you
              own under Yours.
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
                  offerCount={offerCounts[item.tokenId] ?? 0}
                  delistPending={delistTokenId === item.tokenId}
                  onSell={setSellItem}
                  onOffers={setOffersItem}
                  onDelist={(row) => {
                    void handleDelistOwned(row);
                  }}
                />
              ))}
            </div>
          </section>
        ) : null}

        {!showEmptyBrowse && status === 'ready' ? (
          <div
            className="discover-tab-bar market-listing-filters"
            role="tablist"
            aria-label="Listing type"
          >
            <div className="discover-tab-bar-scroller">
              {LISTING_FILTERS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={listingFilter === tab.id}
                  className={listingFilter === tab.id ? 'is-active' : undefined}
                  onClick={() => setListingFilter(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {status === 'ready' &&
        listings.length === 0 &&
        sales.length > 0 &&
        !showEmptyBrowse ? (
          <p className="market-page-status">
            No active listings — recent sales below.
          </p>
        ) : null}

        {showEmptyFilter ? (
          <p className="market-page-status">
            Nothing in {listingFilter === 'auctions' ? 'Auctions' : 'Fixed'}{' '}
            right now.
          </p>
        ) : null}

        {filteredListings.length > 0 ? (
          <section className="market-section" aria-labelledby="market-new">
            <h2 id="market-new" className="market-section-title">
              {listingFilter === 'auctions'
                ? 'Auctions'
                : listingFilter === 'fixed'
                  ? 'Fixed price'
                  : 'New listings'}
            </h2>
            <div className="market-listing-list">
              {filteredListings.map((item) => {
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
        onMakeOffer={
          buyListing?.status === 'listed' && buyListing.tokenId
            ? () => {
                const listing = buyListing;
                setBuyListing(null);
                setOfferListing({
                  tokenId: listing.tokenId!,
                  title: listing.title,
                  mediaUrl: listing.mediaUrl,
                  ownerId: listing.creatorId,
                  askNear: listing.priceNear,
                });
              }
            : undefined
        }
      />

      <ScarceBidSheet
        open={bidListing != null}
        listing={bidListing}
        onOpenChange={(open) => {
          if (!open) setBidListing(null);
        }}
        onBid={handleBid}
      />

      <ScarceOfferSheet
        open={offerListing != null}
        listing={offerListing}
        onOpenChange={(open) => {
          if (!open) setOfferListing(null);
        }}
        onOffered={handleOffered}
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

      <ScarceOffersSheet
        open={offersItem != null}
        item={offersItem}
        onOpenChange={(open) => {
          if (!open) setOffersItem(null);
        }}
        onAccepted={() => {
          setOffersItem(null);
          setOfferCounts((current) => {
            if (!offersItem?.tokenId) return current;
            const next = { ...current };
            delete next[offersItem.tokenId];
            return next;
          });
          setRetryKey((value) => value + 1);
        }}
      />
    </OsAppScreen>
  );
}
