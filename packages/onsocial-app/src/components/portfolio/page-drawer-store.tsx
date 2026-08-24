'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import { MarketListingRow } from '@/features/market/market-listing-row';
import {
  auctionExpiresAtMs,
  collectionIdFromTokenId,
  fetchMarketListings,
  invalidateLiveListingsCache,
  marketListingRowKey,
  type MarketListingItem,
} from '@/features/market/market-listings';
import { invalidateOwnedVaultCache } from '@/features/market/owned-vault-cache';
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
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import {
  PortfolioDropRow,
  isDropMintable,
} from '@/components/portfolio/portfolio-drop-row';
import {
  mergeDropFanRoster,
  useDropFanRosters,
} from '@/hooks/use-drop-fan-rosters';
import { useScarceCollectionSaves } from '@/hooks/use-scarce-collection-saves';
import { accountIdsEqual } from '@/lib/account-match';
import {
  filterBuyableStoreDrops,
  filterDropsNotListed,
} from '@/lib/profile-store-available';
import type {
  ProfileStoreDrop,
  ProfileStoreShelf,
} from '@/lib/profile-store-types';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

/** Full-list page size — matches Market's creator view. */
const PAGE_DRAWER_STORE_PAGE = 24;

function sourcePostCoords(
  path: string | undefined
): { author: string; postId: string } | null {
  if (!path?.trim()) return null;
  const match = path.trim().match(/^(.+)\/post\/(.+)$/);
  if (!match?.[1] || !match[2]) return null;
  return { author: match[1], postId: match[2] };
}

function listedCollectionIds(
  listings: MarketListingItem[]
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const item of listings) {
    if (item.kind !== 'lazy') continue;
    const collectionId =
      item.collectionId?.trim() ||
      (item.tokenId ? collectionIdFromTokenId(item.tokenId) : null);
    if (collectionId) ids.add(collectionId);
  }
  return ids;
}

function dropToBuyListing(
  drop: ProfileStoreDrop,
  creatorId: string
): ScarceBuyListing {
  return {
    status: 'drop',
    collectionId: drop.collectionId,
    priceNear: drop.priceNear ?? '0',
    title: drop.title,
    mediaUrl: drop.mediaUrl,
    creatorId,
    ...(drop.totalSupply > 0 ? { copies: drop.totalSupply } : {}),
    ...(drop.remaining >= 0 ? { remaining: drop.remaining } : {}),
  };
}

interface ListingsState {
  items: MarketListingItem[];
  nextOffset: number;
  hasMore: boolean;
  status: 'loading' | 'ready' | 'error';
}

function appendUniqueItems(
  current: MarketListingItem[],
  incoming: MarketListingItem[]
): MarketListingItem[] {
  const seen = new Set(current.map(marketListingRowKey));
  return [
    ...current,
    ...incoming.filter((item) => !seen.has(marketListingRowKey(item))),
  ];
}

/**
 * Scarces → Available: the creator's Market view in place. Vertical sections
 * (For sale, then Drops) with the same rows and actions as Market — Buy /
 * Bid / Mint for visitors, Listed / Cancel on the viewer's own listings.
 */
export function PageDrawerStoreList({
  pageAccountId,
  profileName,
  avatarUrl,
  shelf,
}: {
  pageAccountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  shelf: ProfileStoreShelf;
}) {
  const { accountId: viewerAccountId, getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const router = useRouter();

  const [listingsState, setListingsState] = useState<ListingsState>({
    items: [],
    nextOffset: 0,
    hasMore: shelf.hasMore,
    status: 'loading',
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [cancelRowKey, setCancelRowKey] = useState<string | null>(null);
  const [buyListing, setBuyListing] = useState<ScarceBuyListing | null>(null);
  const [bidListing, setBidListing] = useState<ScarceBidListing | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    setListingsState((prev) => ({ ...prev, status: 'loading' }));
    void fetchMarketListings({
      sellerId: pageAccountId,
      limit: PAGE_DRAWER_STORE_PAGE,
    })
      .then((page) => {
        if (cancelled) return;
        setListingsState({
          items: page.items,
          nextOffset: page.nextOffset,
          hasMore: page.hasMore,
          status: 'ready',
        });
      })
      .catch(() => {
        if (cancelled) return;
        setListingsState((prev) => ({ ...prev, status: 'error' }));
      });
    return () => {
      cancelled = true;
    };
  }, [pageAccountId, retryKey]);

  const hasLiveAuctionClocks = useMemo(
    () =>
      listingsState.items.some(
        (item) => item.kind === 'auction' && item.expiresAtNs != null
      ),
    [listingsState.items]
  );

  useEffect(() => {
    if (!hasLiveAuctionClocks) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [hasLiveAuctionClocks]);

  const drops = useMemo(
    () =>
      filterDropsNotListed(
        filterBuyableStoreDrops(shelf.drops),
        listedCollectionIds(listingsState.items)
      ),
    [listingsState.items, shelf.drops]
  );
  const fanRosters = useDropFanRosters(drops.map((drop) => drop.collectionId));
  const dropCollectionIds = useMemo(
    () => drops.map((drop) => drop.collectionId),
    [drops]
  );
  const { viewerSaved, isSavePending, toggleSave } = useScarceCollectionSaves({
    collectionIds: dropCollectionIds,
    onError: (message) => setTxResult({ type: 'error', msg: message }),
  });

  const handleDropOwnerManaged = useCallback(
    (change: 'paused' | 'resumed' | 'deleted') => {
      if (change === 'deleted' || change === 'paused') {
        router.refresh();
      }
    },
    [router]
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || !listingsState.hasMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchMarketListings({
        sellerId: pageAccountId,
        limit: PAGE_DRAWER_STORE_PAGE,
        offset: listingsState.nextOffset,
      });
      setListingsState((prev) => ({
        items: appendUniqueItems(prev.items, page.items),
        nextOffset: page.nextOffset,
        hasMore: page.hasMore,
        status: 'ready',
      }));
    } catch {
      // Leave hasMore set so the button can retry.
    } finally {
      setLoadingMore(false);
    }
  }, [
    listingsState.hasMore,
    listingsState.nextOffset,
    loadingMore,
    pageAccountId,
  ]);

  const handleBuy = useCallback(
    (item: MarketListingItem) => {
      const isOwn =
        Boolean(viewerAccountId) &&
        accountIdsEqual(viewerAccountId!, item.creatorId);
      const endsAtMs = auctionExpiresAtMs(item.expiresAtNs);
      const auctionEnded =
        item.kind === 'auction' && endsAtMs != null && endsAtMs <= Date.now();
      const listingCollectionId =
        item.collectionId?.trim() ||
        (item.tokenId ? collectionIdFromTokenId(item.tokenId) : null) ||
        undefined;
      // Own live listings aren't buyable; ended own auctions open settle.
      if (isOwn && !auctionEnded) return;
      if (item.kind === 'auction') {
        const tokenId = item.tokenId?.trim();
        if (!tokenId) return;
        setBidListing({
          tokenId,
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
          ...(item.playables?.length ? { playables: item.playables } : {}),
          ...(item.blockTimestamp > 0
            ? { listedAtMs: item.blockTimestamp }
            : {}),
        });
        return;
      }
      if (isOwn) return;
      if (item.kind === 'native' && item.tokenId) {
        setBuyListing({
          tokenId: item.tokenId,
          status: 'listed',
          priceNear: item.priceNear,
          title: item.title,
          ...(item.description ? { description: item.description } : {}),
          mediaUrl: item.mediaUrl,
          creatorId: item.creatorId,
          ...(listingCollectionId ? { collectionId: listingCollectionId } : {}),
          ...(item.artistId?.trim() ? { artistId: item.artistId.trim() } : {}),
          ...(item.cardBg ? { cardBg: item.cardBg } : {}),
          ...(item.sourcePostPath
            ? { sourcePostPath: item.sourcePostPath }
            : {}),
          ...(item.postHref ? { postHref: item.postHref } : {}),
          ...(item.playable ? { playable: item.playable } : {}),
          ...(item.playables?.length ? { playables: item.playables } : {}),
          ...(item.blockTimestamp > 0
            ? { listedAtMs: item.blockTimestamp }
            : {}),
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
        ...(listingCollectionId ? { collectionId: listingCollectionId } : {}),
        ...(item.artistId?.trim() ? { artistId: item.artistId.trim() } : {}),
        ...(item.cardBg ? { cardBg: item.cardBg } : {}),
        copies: item.copies,
        remaining: item.remaining,
        ...(item.sourcePostPath ? { sourcePostPath: item.sourcePostPath } : {}),
        ...(item.postHref ? { postHref: item.postHref } : {}),
        ...(item.playable ? { playable: item.playable } : {}),
        ...(item.playables?.length ? { playables: item.playables } : {}),
        ...(item.blockTimestamp > 0 ? { listedAtMs: item.blockTimestamp } : {}),
      });
    },
    [viewerAccountId]
  );

  const handleMintDrop = useCallback(
    (drop: ProfileStoreDrop) => {
      setBuyListing(dropToBuyListing(drop, pageAccountId));
    },
    [pageAccountId]
  );

  const handlePurchased = useCallback(() => {
    setBuyListing(null);
    if (viewerAccountId) invalidateOwnedVaultCache(viewerAccountId);
    setRetryKey((value) => value + 1);
  }, [viewerAccountId]);

  const handleBid = useCallback(() => {
    setBidListing(null);
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

        setListingsState((current) => ({
          ...current,
          items: current.items.filter(
            (row) => marketListingRowKey(row) !== rowKey
          ),
        }));
        invalidateLiveListingsCache(item.creatorId);
        invalidateOwnedVaultCache(item.creatorId);
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

  const viewerIsPageOwner =
    Boolean(viewerAccountId) &&
    accountIdsEqual(viewerAccountId!, pageAccountId);
  const loading = listingsState.status === 'loading';
  const showListings = listingsState.items.length > 0;
  const showDrops = drops.length > 0;
  const isEmpty =
    !loading && !showListings && !showDrops && !listingsState.hasMore;

  return (
    <div className="portfolio-store">
      {loading && !showListings ? <MarketListSkeleton rows={3} /> : null}

      {showListings ? (
        <section
          className="market-section"
          aria-labelledby="page-drawer-store-listings"
        >
          <h3 id="page-drawer-store-listings" className="market-section-title">
            For sale
          </h3>
          <div className="market-listing-list" role="list">
            {listingsState.items.map((item) => {
              const rowKey = marketListingRowKey(item);
              return (
                <MarketListingRow
                  key={rowKey}
                  item={item}
                  nowMs={nowMs}
                  isOwnListing={(() => {
                    if (
                      !viewerAccountId ||
                      !accountIdsEqual(viewerAccountId, item.creatorId)
                    ) {
                      return false;
                    }
                    // Own ended auctions keep Bid/Settle; live own rows are Listed.
                    if (item.kind !== 'auction') return true;
                    const endsAtMs = auctionExpiresAtMs(item.expiresAtNs);
                    return endsAtMs == null || endsAtMs > Date.now();
                  })()}
                  cancelPending={cancelRowKey === rowKey}
                  onBuy={handleBuy}
                  onCancel={(row) => {
                    void handleCancel(row);
                  }}
                />
              );
            })}
          </div>
          {listingsState.hasMore && listingsState.status !== 'error' ? (
            <button
              type="button"
              className="market-sales-more"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? 'Loading…' : 'Show more'}
            </button>
          ) : null}
        </section>
      ) : null}

      {showDrops ? (
        <section
          className="market-section"
          aria-labelledby="page-drawer-store-drops"
        >
          <h3 id="page-drawer-store-drops" className="market-section-title">
            Drops
          </h3>
          <div className="market-listing-list" role="list">
            {drops.map((drop) => (
              <PortfolioDropRow
                key={drop.key}
                pageAccountId={pageAccountId}
                displayName={profileName}
                avatarUrl={avatarUrl}
                drop={mergeDropFanRoster(
                  drop,
                  fanRosters.get(drop.collectionId.trim())
                )}
                saved={viewerSaved(drop.collectionId)}
                savePending={isSavePending(drop.collectionId)}
                onToggleSave={() => {
                  void toggleSave(drop.collectionId);
                }}
                onOwnerManaged={handleDropOwnerManaged}
                onMint={
                  !viewerIsPageOwner && isDropMintable(drop)
                    ? handleMintDrop
                    : undefined
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      {listingsState.status === 'error' && !showListings ? (
        <p className="page-drawer-section-empty" role="alert">
          Couldn’t load listings.{' '}
          <button
            type="button"
            className="market-page-retry"
            onClick={() => setRetryKey((value) => value + 1)}
          >
            Retry
          </button>
        </p>
      ) : null}

      {isEmpty ? (
        <p className="page-drawer-section-empty">Nothing for sale right now.</p>
      ) : null}

      <ScarceBuySheet
        open={buyListing != null}
        listing={buyListing}
        onOpenChange={(open) => {
          if (!open) setBuyListing(null);
        }}
        onPurchased={handlePurchased}
      />

      <ScarceBidSheet
        open={bidListing != null}
        listing={bidListing}
        onOpenChange={(open) => {
          if (!open) setBidListing(null);
        }}
        onBid={handleBid}
      />
    </div>
  );
}
