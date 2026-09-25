'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  marketPostLayerLinkHandlers,
  useMarketPostLayer,
} from '@/features/market/market-post-layer';
import {
  OsSheetAction,
  OsSheetActions,
} from '@onsocial/ui';
import {
  auctionExpiresAtMs,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import { CollectiblesHoldingRowMenu } from '@/features/collectibles/collectibles-holding-row-menu';
import { requestDropCompose } from '@/features/scarces/drop-compose-draft';
import {
  holdingsActionLabel,
  holdingsHrefForOwned,
} from '@/lib/portfolio-holdings';
import { postHrefFromSourcePath } from '@/lib/scarce-creator-earnings';

interface MarketOwnedRowProps {
  item: OwnedScarceItem;
  settlePending?: boolean;
  /** Highest open offer (NEAR), when known from the offers catalog. */
  highestOfferNear?: string | null;
  offerCount?: number;
  /** Clock for ended-auction settle CTA. */
  nowMs?: number;
  onSell: (item: OwnedScarceItem) => void;
  onTransfer?: (item: OwnedScarceItem) => void;
  /** Refresh after the manage drawer delists or burns. */
  onChanged?: () => void;
  onSettle?: (item: OwnedScarceItem) => void;
  onOffers?: (item: OwnedScarceItem) => void;
}

function formatPriceNear(priceNear: string): string {
  const n = Number.parseFloat(priceNear);
  if (!Number.isFinite(n)) return priceNear;
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

/** Owned scarce in Market “Yours” — Manage; Post when listed (Drop or resale). */
export function MarketOwnedRow({
  item,
  settlePending = false,
  highestOfferNear = null,
  offerCount = 0,
  nowMs,
  onSell,
  onTransfer,
  onChanged,
  onSettle,
  onOffers,
}: MarketOwnedRowProps) {
  const router = useRouter();
  const openMarketPost = useMarketPostLayer();
  const listed = item.listingKind != null;
  const auction = item.listingKind === 'auction';
  const auctionHasBids = auction && (item.bidCount ?? 0) > 0;
  const endsAtMs = auctionExpiresAtMs(item.expiresAtNs);
  const auctionEnded =
    auction &&
    endsAtMs != null &&
    typeof nowMs === 'number' &&
    endsAtMs <= nowMs;
  const needsSettle = Boolean(auctionHasBids && auctionEnded && onSettle);
  // Offers are open-book (no list-time opt-in). Only surface the control when
  // the catalog shows at least one live offer — empty "Offers" next to Sell
  // reads like a parallel primary action.
  const hasOffers = offerCount > 0 && Boolean(highestOfferNear?.trim());
  const showOffers = Boolean(onOffers) && hasOffers;
  const offersLabel = offerCount > 1 ? 'Offers' : 'Offer';
  const offersAriaLabel = highestOfferNear?.trim()
    ? offerCount > 1
      ? `Offers, top ${formatPriceNear(highestOfferNear)} NEAR`
      : `Offer ${formatPriceNear(highestOfferNear)} NEAR`
    : offersLabel;
  const useHref = holdingsHrefForOwned({
    tokenId: item.tokenId,
    collectionId: item.collectionId,
    sourcePostPath: item.sourcePostPath,
    postHref: item.postHref,
    mediumKind: item.mediumKind,
  });
  const useAction = holdingsActionLabel(item.mediumKind);
  // Posted scarce → open the source post (mint/buy lives there) when not listed.
  const sourcePostHref =
    item.postHref?.trim() ||
    postHrefFromSourcePath(item.sourcePostPath) ||
    null;
  const showViewSourcePost = Boolean(sourcePostHref);
  // Listed Drop edition or post-minted scarce → Post announce (Resale in feed).
  const showPostCompose =
    listed &&
    Boolean(item.collectionId?.trim() || item.tokenId?.trim());
  const [brokenMediaUrl, setBrokenMediaUrl] = useState<string | null>(null);
  const showThumb = Boolean(item.mediaUrl) && brokenMediaUrl !== item.mediaUrl;

  const thumb = showThumb ? (
    <img
      src={item.mediaUrl!}
      alt=""
      onError={() => setBrokenMediaUrl(item.mediaUrl ?? null)}
    />
  ) : (
    <span className="market-listing-thumb-fallback" aria-hidden />
  );

  const title = useHref ? (
    <Link
      href={useHref}
      scroll={false}
      className="market-listing-title-link"
      {...marketPostLayerLinkHandlers(useHref, openMarketPost)}
    >
      {item.title}
    </Link>
  ) : (
    item.title
  );

  return (
    <div className="market-listing-row" role="listitem">
      {useHref ? (
        <Link
          href={useHref}
          scroll={false}
          className={`market-listing-thumb${showThumb ? ' has-media' : ''}`}
          aria-label={`${useAction} ${item.title}`}
          {...marketPostLayerLinkHandlers(useHref, openMarketPost)}
        >
          {thumb}
        </Link>
      ) : (
        <div
          className={`market-listing-thumb${showThumb ? ' has-media' : ''}`}
          aria-hidden
        >
          {thumb}
        </div>
      )}
      <div className="market-listing-copy">
        <div className="market-listing-head">
          <p className="market-listing-title">{title}</p>
        </div>
        <p className="market-listing-meta">
          {listed && item.listedPriceNear ? (
            <>
              <span className="market-listing-price">
                {auction ? 'Reserve' : 'Ask'} ·{' '}
                {formatPriceNear(item.listedPriceNear)} NEAR
              </span>
              <span className="market-listing-own"> · </span>
            </>
          ) : null}
          {auction ? (
            <span className="market-listing-own">
              {needsSettle
                ? `${item.bidCount === 1 ? '1 bid' : `${item.bidCount} bids`} · ended`
                : auctionHasBids
                  ? `${item.bidCount === 1 ? '1 bid' : `${item.bidCount} bids`} · live`
                  : 'Auction live'}
            </span>
          ) : listed ? (
            <span className="market-listing-own">Listed</span>
          ) : (
            <span className="market-listing-own">Ready to sell</span>
          )}
          {showOffers ? (
            <span className="market-listing-own">
              {' · '}
              {offerCount === 1
                ? `Offer ${formatPriceNear(highestOfferNear!)} NEAR`
                : `${offerCount} offers · top ${formatPriceNear(highestOfferNear!)} NEAR`}
            </span>
          ) : null}
        </p>
      </div>
      <div className="market-listing-action-col">
        {showOffers ? (
          <OsSheetActions
            layout="row-compact"
            tone="frosted-primary"
            size="sm"
            borderless
            className="market-listing-action"
          >
            <OsSheetAction
              type="button"
              variant="primary"
              ready
              aria-label={offersAriaLabel}
              onClick={() => onOffers?.(item)}
            >
              {offersLabel}
            </OsSheetAction>
          </OsSheetActions>
        ) : null}
        {needsSettle ? (
          <OsSheetActions
            layout="row-compact"
            tone="frosted-primary"
            size="sm"
            borderless
            className="market-listing-action"
          >
            <OsSheetAction
              type="button"
              variant={showOffers ? 'ghost' : 'primary'}
              ready={!settlePending}
              pending={settlePending}
              pendingLabel="Settling…"
              onClick={() => onSettle?.(item)}
            >
              Complete
            </OsSheetAction>
          </OsSheetActions>
        ) : (
          <CollectiblesHoldingRowMenu
            item={item}
            trigger="label"
            showOpenInMarket={false}
            onList={() => onSell(item)}
            onTransfer={onTransfer ? () => onTransfer(item) : undefined}
            onDelisted={onChanged}
          />
        )}
        {showPostCompose ? (
          <OsSheetActions
            layout="row-compact"
            tone="frosted-primary"
            size="sm"
            borderless
            className="market-listing-action"
          >
            <OsSheetAction
              type="button"
              variant="ghost"
              ready
              onClick={() => {
                const collectionId = item.collectionId?.trim() || '';
                requestDropCompose({
                  ...(collectionId ? { collectionId } : {}),
                  tokenId: item.tokenId,
                  title: item.title,
                  ...(item.mediaUrl ? { mediaUrl: item.mediaUrl } : {}),
                  ...(item.mediumKind
                    ? { mediumKind: item.mediumKind }
                    : {}),
                  ...(item.sourcePostPath
                    ? { sourcePostPath: item.sourcePostPath }
                    : {}),
                });
              }}
            >
              Post
            </OsSheetAction>
          </OsSheetActions>
        ) : !listed && showViewSourcePost && sourcePostHref ? (
          <OsSheetActions
            layout="row-compact"
            tone="frosted-primary"
            size="sm"
            borderless
            className="market-listing-action"
          >
            <OsSheetAction
              type="button"
              variant="ghost"
              ready
              onClick={() => {
                if (openMarketPost(sourcePostHref)) return;
                router.push(sourcePostHref);
              }}
            >
              View post
            </OsSheetAction>
          </OsSheetActions>
        ) : null}
      </div>
    </div>
  );
}
