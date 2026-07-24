'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { SearchField, ShopFillIcon } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import { MarketListingRow } from '@/features/market/market-listing-row';
import { MarketListingSortMenu } from '@/features/market/market-listing-sort-menu';
import {
  fetchMarketListings,
  fetchMarketSales,
  fetchOwnedScarces,
  excludeOwnedNativeListings,
  marketListingRowKey,
  sortMarketListings,
  type MarketListingItem,
  type MarketListingSort,
  type MarketSaleItem,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import { MarketOwnedRow } from '@/features/market/market-owned-row';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';
import type { ScarceBidSuccessDetail } from '@/features/scarces/scarce-bid-form';
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
import {
  fetchMyOpenTokenOffers,
  fetchOfferSummariesByTokenIds,
  type MyOpenTokenOffer,
  type TokenOfferSummary,
} from '@/features/scarces/scarce-offers';
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

function listingMatchesQuery(item: MarketListingItem, query: string): boolean {
  if (!query) return true;
  const haystack = [item.title, item.creatorId, item.tokenId, item.listingId]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

type LoadStatus = 'loading' | 'ready' | 'error';
type ListingFilter = 'all' | 'fixed' | 'auctions';

const LISTING_FILTERS: { id: ListingFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'fixed', label: 'Fixed' },
  { id: 'auctions', label: 'Auctions' },
];

/** Initial Recent sales rows; expand shows the rest of the fetched window. */
const RECENT_SALES_PREVIEW = 8;

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

function formatSaleTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  const ms = timestamp > 1e15 ? Math.floor(timestamp / 1e6) : timestamp;
  const elapsed = Math.max(0, Date.now() - ms);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
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
  const [listingSort, setListingSort] = useState<MarketListingSort>('newest');
  const [listingQuery, setListingQuery] = useState('');
  const [salesExpanded, setSalesExpanded] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [offerByToken, setOfferByToken] = useState<
    Map<string, TokenOfferSummary>
  >(() => new Map());
  const [myOffers, setMyOffers] = useState<MyOpenTokenOffer[]>([]);
  const [offersRevision, setOffersRevision] = useState(0);
  const toolbarHidden = useDockAutoHide(sortMenuOpen);
  const normalizedListingQuery = listingQuery.trim().toLowerCase();
  const searching = normalizedListingQuery.length > 0;

  const setFilter = useCallback((next: ListingFilter) => {
    setListingFilter(next);
    if (next === 'fixed') {
      setListingSort((current) => (current === 'ending' ? 'newest' : current));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSalesExpanded(false);
    void Promise.allSettled([
      fetchMarketListings(),
      fetchMarketSales(),
      viewerAccountId
        ? fetchOwnedScarces(viewerAccountId)
        : Promise.resolve([] as OwnedScarceItem[]),
    ]).then((results) => {
      if (cancelled) return;
      const listings =
        results[0].status === 'fulfilled' ? results[0].value : null;
      const sales = results[1].status === 'fulfilled' ? results[1].value : null;
      const owned = results[2].status === 'fulfilled' ? results[2].value : null;
      // Hard-fail only when every browse source fails.
      if (listings == null && sales == null && owned == null) {
        setFailedKey(retryKey);
        return;
      }
      setData({
        key: retryKey,
        listings: listings ?? [],
        sales: sales ?? [],
        owned: owned ?? [],
      });
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
  const ownedTokenIdSet = new Set(owned.map((item) => item.tokenId));
  const browseListings = excludeOwnedNativeListings(listings, ownedTokenIdSet);

  useEffect(() => {
    if (status !== 'ready') return;
    let cancelled = false;
    const tokenIds = [
      ...owned.map((item) => item.tokenId),
      ...listings.map((item) => item.tokenId?.trim() ?? '').filter(Boolean),
    ];
    void Promise.all([
      fetchOfferSummariesByTokenIds(tokenIds),
      viewerAccountId
        ? fetchMyOpenTokenOffers(viewerAccountId)
        : Promise.resolve([] as MyOpenTokenOffer[]),
    ]).then(([summaries, mine]) => {
      if (cancelled) return;
      setOfferByToken(summaries);
      setMyOffers(mine);
    });
    return () => {
      cancelled = true;
    };
  }, [retryKey, viewerAccountId, offersRevision, status, owned, listings]);

  const typedListings =
    listingFilter === 'auctions'
      ? browseListings.filter((item) => item.kind === 'auction')
      : listingFilter === 'fixed'
        ? browseListings.filter((item) => item.kind !== 'auction')
        : browseListings;
  const queriedListings = searching
    ? typedListings.filter((item) =>
        listingMatchesQuery(item, normalizedListingQuery)
      )
    : typedListings;
  const filteredListings = sortMarketListings(queriedListings, listingSort);

  const hasLiveAuctionClocks = filteredListings.some(
    (item) =>
      item.kind === 'auction' &&
      item.expiresAtNs != null &&
      Number.isFinite(item.expiresAtNs) &&
      item.expiresAtNs > 0
  );

  useEffect(() => {
    if (!hasLiveAuctionClocks || status !== 'ready') return;
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [hasLiveAuctionClocks, status]);

  const handleBuy = useCallback(
    (item: MarketListingItem) => {
      if (viewerAccountId && accountIdsEqual(viewerAccountId, item.creatorId)) {
        return;
      }
      if (item.kind === 'auction' && item.tokenId) {
        setBidListing({
          tokenId: item.tokenId,
          title: item.title,
          ...(item.description ? { description: item.description } : {}),
          mediaUrl: item.mediaUrl,
          sellerId: item.creatorId,
          priceNear: item.priceNear,
          ...(item.sourcePostPath
            ? { sourcePostPath: item.sourcePostPath }
            : {}),
          ...(item.postHref ? { postHref: item.postHref } : {}),
          ...(item.playable ? { playable: item.playable } : {}),
        });
        return;
      }
      if (item.kind === 'native' && item.tokenId) {
        setBuyListing({
          tokenId: item.tokenId,
          status: 'listed',
          priceNear: item.priceNear,
          title: item.title,
          ...(item.description ? { description: item.description } : {}),
          mediaUrl: item.mediaUrl,
          creatorId: item.creatorId,
          ...(item.cardBg ? { cardBg: item.cardBg } : {}),
          ...(item.sourcePostPath
            ? { sourcePostPath: item.sourcePostPath }
            : {}),
          ...(item.postHref ? { postHref: item.postHref } : {}),
          ...(item.playable ? { playable: item.playable } : {}),
        });
        return;
      }
      if (!item.listingId) return;
      setBuyListing({
        listingId: item.listingId,
        status: 'lazy_listing',
        priceNear: item.priceNear,
        title: item.title,
        ...(item.description ? { description: item.description } : {}),
        mediaUrl: item.mediaUrl,
        creatorId: item.creatorId,
        ...(item.cardBg ? { cardBg: item.cardBg } : {}),
        copies: item.copies,
        remaining: item.remaining,
        ...(item.sourcePostPath ? { sourcePostPath: item.sourcePostPath } : {}),
        ...(item.postHref ? { postHref: item.postHref } : {}),
        ...(item.playable ? { playable: item.playable } : {}),
      });
    },
    [viewerAccountId]
  );

  const handlePurchased = useCallback(() => {
    setBuyListing(null);
    setRetryKey((value) => value + 1);
  }, []);

  const handleBid = useCallback(
    (detail?: ScarceBidSuccessDetail) => {
      const listing = bidListing;
      setBidListing(null);
      if (
        detail?.settled &&
        detail.tokenId &&
        viewerAccountId &&
        listing?.tokenId === detail.tokenId
      ) {
        setData((current) => {
          if (!current) return current;
          const alreadyOwned = current.owned.some(
            (row) => row.tokenId === detail.tokenId
          );
          return {
            ...current,
            listings: current.listings.filter(
              (row) => row.tokenId !== detail.tokenId
            ),
            owned: alreadyOwned
              ? current.owned
              : [
                  {
                    tokenId: detail.tokenId,
                    title: listing.title?.trim() || 'Scarce',
                    mediaUrl: listing.mediaUrl,
                    ownerId: viewerAccountId,
                    listingKind: null,
                    listedPriceNear: null,
                  },
                  ...current.owned,
                ],
          };
        });
      }
      setRetryKey((value) => value + 1);
    },
    [bidListing, viewerAccountId]
  );

  const handleOffered = useCallback(() => {
    setOfferListing(null);
    setOffersRevision((value) => value + 1);
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
                    ? { ...row, listingKind: null, listedPriceNear: null }
                    : row
                ),
              }
            : current
        );

        const coords = sourcePostCoords(item.sourcePostPath);
        if (coords && item.kind === 'lazy') {
          setScarceEmbedOverride(postScarceKey(coords.author, coords.postId), {
            status: 'none',
            events: [],
          });
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

  const handleManageOwned = useCallback(
    async (item: OwnedScarceItem) => {
      if (delistTokenId) return;
      if (item.listingKind === 'auction' && (item.bidCount ?? 0) > 0) {
        setTxResult({
          type: 'error',
          msg: 'This auction already has bids — wait for it to end, then settle.',
        });
        return;
      }
      setDelistTokenId(item.tokenId);
      try {
        const { accountId, wallet } = await getSigningWallet();
        const client = createAppScarcesWalletClient(accountId, wallet);
        const response =
          item.listingKind === 'auction'
            ? await client.scarces.auctions.cancel(item.tokenId)
            : await client.scarces.market.delist(item.tokenId);
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
    status === 'ready' && browseListings.length === 0 && owned.length === 0;
  const showEmptyFilter =
    status === 'ready' &&
    browseListings.length > 0 &&
    filteredListings.length === 0;
  const visibleSales =
    salesExpanded || sales.length <= RECENT_SALES_PREVIEW
      ? sales
      : sales.slice(0, RECENT_SALES_PREVIEW);
  const hiddenSalesCount = Math.max(0, sales.length - visibleSales.length);

  const showListingToolbar = status !== 'error' && !showEmptyBrowse;
  const showOwnedSection =
    Boolean(viewerAccountId) && owned.length > 0 && !searching;
  const showMyOffersSection =
    Boolean(viewerAccountId) && myOffers.length > 0 && !searching;
  const showSalesSection = sales.length > 0 && !searching;

  const titleForToken = useCallback(
    (tokenId: string): { title: string; mediaUrl?: string | null } => {
      const ownedHit = owned.find((row) => row.tokenId === tokenId);
      if (ownedHit) {
        return { title: ownedHit.title, mediaUrl: ownedHit.mediaUrl };
      }
      const listingHit = listings.find((row) => row.tokenId === tokenId);
      if (listingHit) {
        return { title: listingHit.title, mediaUrl: listingHit.mediaUrl };
      }
      return { title: `Scarce · ${tokenId}` };
    },
    [listings, owned]
  );

  return (
    <OsAppScreen
      title="Market"
      leading={null}
      heading={
        <SearchField
          value={listingQuery}
          onValueChange={setListingQuery}
          placeholder="Search listings"
          clearAriaLabel="Clear search"
          ariaLabel="Search Market listings"
          className="discover-nav-search-field os-app-screen-search"
          leadingIcon={
            <ShopFillIcon className="search-field-icon" aria-hidden />
          }
        />
      }
      toolbar={
        showListingToolbar ? (
          <div
            className={`os-app-chrome-rail market-listing-toolbar${
              toolbarHidden ? ' is-scroll-hidden' : ''
            }`}
          >
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
                    id={`market-listing-tab-${tab.id}`}
                    aria-controls="market-listing-results"
                    aria-selected={listingFilter === tab.id}
                    className={
                      listingFilter === tab.id ? 'is-active' : undefined
                    }
                    onClick={() => setFilter(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <MarketListingSortMenu
              sort={listingSort}
              onSortChange={setListingSort}
              endingDisabled={listingFilter === 'fixed'}
              onOpenChange={setSortMenuOpen}
            />
          </div>
        ) : undefined
      }
    >
      <div className="market-page">
        {status === 'loading' ? (
          <div className="market-section" aria-busy="true" aria-live="polite">
            <p className="sr-only">Loading listings…</p>
            <MarketListSkeleton rows={5} />
          </div>
        ) : null}
        {status === 'error' ? (
          <p className="market-page-status" role="alert">
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
              Nothing listed yet. List a scarce from a post, or sell one you own
              under Yours.
            </p>
            <Link className="app-soon-link" href={APP_HOME_PATH}>
              Back to Home
            </Link>
          </div>
        ) : null}

        {status === 'ready' &&
        browseListings.length === 0 &&
        sales.length > 0 &&
        !showEmptyBrowse ? (
          <p className="market-page-status">
            No active listings — recent sales below.
          </p>
        ) : null}

        {showEmptyFilter ? (
          <p className="market-page-status">
            {searching
              ? `No listings match “${listingQuery.trim()}”.`
              : `Nothing in ${
                  listingFilter === 'auctions' ? 'Auctions' : 'Fixed'
                } right now.`}
          </p>
        ) : null}

        {filteredListings.length > 0 ? (
          <section
            id="market-listing-results"
            role="tabpanel"
            aria-labelledby={`market-listing-tab-${listingFilter}`}
            className="market-section"
          >
            <h2 id="market-new" className="sr-only">
              {listingFilter === 'auctions'
                ? 'Auctions'
                : listingFilter === 'fixed'
                  ? 'Fixed price'
                  : 'Listings'}
            </h2>
            <div className="market-listing-list" role="list">
              {filteredListings.map((item) => {
                const rowKey = marketListingRowKey(item);
                const offerSummary = item.tokenId
                  ? offerByToken.get(item.tokenId)
                  : undefined;
                return (
                  <MarketListingRow
                    key={rowKey}
                    item={item}
                    nowMs={nowMs}
                    highestOfferNear={offerSummary?.highestAmountNear ?? null}
                    isOwnListing={
                      Boolean(viewerAccountId) &&
                      item.kind === 'lazy' &&
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

        {showOwnedSection ? (
          <section className="market-section" aria-labelledby="market-yours">
            <h2 id="market-yours" className="market-section-title">
              Yours
            </h2>
            <div className="market-listing-list" role="list">
              {owned.map((item) => {
                const offerSummary = offerByToken.get(item.tokenId);
                return (
                  <MarketOwnedRow
                    key={item.tokenId}
                    item={item}
                    highestOfferNear={offerSummary?.highestAmountNear ?? null}
                    offerCount={offerSummary?.offerCount ?? 0}
                    delistPending={delistTokenId === item.tokenId}
                    onSell={setSellItem}
                    onOffers={setOffersItem}
                    onDelist={(row) => {
                      void handleManageOwned(row);
                    }}
                  />
                );
              })}
            </div>
          </section>
        ) : null}

        {showMyOffersSection ? (
          <section
            className="market-section"
            aria-labelledby="market-my-offers"
          >
            <h2 id="market-my-offers" className="market-section-title">
              Your offers
            </h2>
            <div className="market-listing-list" role="list">
              {myOffers.map((offer) => {
                const meta = titleForToken(offer.tokenId);
                const priceLabel = Number.parseFloat(offer.amountNear);
                const priceNear = Number.isFinite(priceLabel)
                  ? priceLabel.toLocaleString('en-US', {
                      maximumFractionDigits: 4,
                    })
                  : offer.amountNear;
                return (
                  <div
                    key={`my-offer:${offer.tokenId}`}
                    className="market-listing-row"
                    role="listitem"
                  >
                    <div
                      className={`market-listing-thumb${meta.mediaUrl ? ' has-media' : ''}`}
                      aria-hidden
                    >
                      {meta.mediaUrl ? (
                        <img src={meta.mediaUrl} alt="" />
                      ) : (
                        <span className="market-listing-thumb-fallback" />
                      )}
                    </div>
                    <div className="market-listing-copy">
                      <div className="market-listing-head">
                        <p className="market-listing-title">{meta.title}</p>
                        <p className="market-listing-price">
                          Offer · {priceNear} NEAR
                        </p>
                      </div>
                      <p className="market-listing-meta">
                        <span className="market-listing-own">Open offer</span>
                      </p>
                    </div>
                    <OsSheetActions
                      layout="row-compact"
                      tone="frosted-primary"
                      borderless
                      className="market-listing-action"
                    >
                      <OsSheetAction
                        type="button"
                        variant="primary"
                        ready
                        onClick={() => {
                          const listingOwner =
                            listings.find(
                              (row) => row.tokenId === offer.tokenId
                            )?.creatorId ?? '';
                          setOfferListing({
                            tokenId: offer.tokenId,
                            title: meta.title,
                            mediaUrl: meta.mediaUrl,
                            ownerId: listingOwner || viewerAccountId || '',
                            askNear: listings.find(
                              (row) => row.tokenId === offer.tokenId
                            )?.priceNear,
                          });
                        }}
                      >
                        Manage
                      </OsSheetAction>
                    </OsSheetActions>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {showSalesSection ? (
          <section className="market-section" aria-labelledby="market-sales">
            <h2 id="market-sales" className="market-section-title">
              Recent sales
            </h2>
            <ul className="market-sales-list">
              {visibleSales.map((sale, index) => {
                const seller =
                  sale.sellerId?.trim() || sale.creatorId?.trim() || '';
                const saleTime = formatSaleTime(sale.blockTimestamp);
                const title = sale.postHref ? (
                  <Link
                    href={sale.postHref}
                    scroll={false}
                    className="market-listing-title-link"
                  >
                    {sale.title}
                  </Link>
                ) : (
                  sale.title
                );
                return (
                  <li
                    key={`${sale.listingId ?? sale.tokenId ?? 'sale'}:${sale.blockTimestamp}:${index}`}
                    className="market-sale-row"
                  >
                    <div
                      className={`market-listing-thumb${
                        sale.mediaUrl ? ' has-media' : ''
                      }`}
                      aria-hidden
                    >
                      {sale.mediaUrl ? (
                        <img src={sale.mediaUrl} alt="" />
                      ) : (
                        <span className="market-listing-thumb-fallback" />
                      )}
                    </div>
                    <div className="market-listing-copy">
                      <div className="market-listing-head">
                        <p className="market-sale-title">{title}</p>
                        <p className="market-listing-price">
                          {sale.priceNear} NEAR
                        </p>
                      </div>
                      <p className="market-sale-meta">
                        {seller ? (
                          <Link
                            href={portfolioPath(seller)}
                            scroll={false}
                            className="market-listing-handle"
                          >
                            @{fallbackLabel(seller)}
                          </Link>
                        ) : (
                          'Sale'
                        )}
                        {saleTime ? ` · ${saleTime}` : ''}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
            {hiddenSalesCount > 0 ? (
              <button
                type="button"
                className="market-sales-more"
                onClick={() => setSalesExpanded(true)}
              >
                Show {hiddenSalesCount} more
              </button>
            ) : null}
            {salesExpanded && sales.length > RECENT_SALES_PREVIEW ? (
              <button
                type="button"
                className="market-sales-more"
                onClick={() => setSalesExpanded(false)}
              >
                Show less
              </button>
            ) : null}
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
          setOffersRevision((value) => value + 1);
          setRetryKey((value) => value + 1);
        }}
      />
    </OsAppScreen>
  );
}
