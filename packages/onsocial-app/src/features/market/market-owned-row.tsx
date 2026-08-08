'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import {
  auctionExpiresAtMs,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import {
  holdingsActionLabel,
  holdingsHrefForOwned,
} from '@/lib/portfolio-holdings';

interface MarketOwnedRowProps {
  item: OwnedScarceItem;
  delistPending?: boolean;
  settlePending?: boolean;
  /** Highest open offer (NEAR), when known from the offers catalog. */
  highestOfferNear?: string | null;
  offerCount?: number;
  /** Clock for ended-auction settle CTA. */
  nowMs?: number;
  onSell: (item: OwnedScarceItem) => void;
  onDelist: (item: OwnedScarceItem) => void;
  onSettle?: (item: OwnedScarceItem) => void;
  onOffers?: (item: OwnedScarceItem) => void;
}

function formatPriceNear(priceNear: string): string {
  const n = Number.parseFloat(priceNear);
  if (!Number.isFinite(n)) return priceNear;
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

const CONFIRM_LEAVE_MS = 4_000;

/** Owned scarce in Market “Yours” — manage here; title/thumb open Collectibles use. */
export function MarketOwnedRow({
  item,
  delistPending = false,
  settlePending = false,
  highestOfferNear = null,
  offerCount = 0,
  nowMs,
  onSell,
  onDelist,
  onSettle,
  onOffers,
}: MarketOwnedRowProps) {
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
  const offersLabel =
    offerCount > 1
      ? `Offers · ${formatPriceNear(highestOfferNear!)}`
      : `Offer · ${formatPriceNear(highestOfferNear!)}`;
  const [confirmTokenId, setConfirmTokenId] = useState<string | null>(null);
  const confirmTimerRef = useRef<number | null>(null);
  const confirmingDelist =
    confirmTokenId === item.tokenId && listed && !delistPending && !needsSettle;

  const useHref = holdingsHrefForOwned({
    tokenId: item.tokenId,
    collectionId: item.collectionId,
    sourcePostPath: item.sourcePostPath,
    mediumKind: item.mediumKind,
  });
  const useAction = holdingsActionLabel(item.mediumKind);
  const [thumbBroken, setThumbBroken] = useState(false);
  const showThumb = Boolean(item.mediaUrl) && !thumbBroken;

  useEffect(() => {
    setThumbBroken(false);
  }, [item.mediaUrl]);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current !== null) {
        window.clearTimeout(confirmTimerRef.current);
      }
    };
  }, []);

  const clearConfirm = () => {
    if (confirmTimerRef.current !== null) {
      window.clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    setConfirmTokenId(null);
  };

  const handleDelistClick = () => {
    if (delistPending || settlePending) return;
    if (!confirmingDelist) {
      setConfirmTokenId(item.tokenId);
      confirmTimerRef.current = window.setTimeout(() => {
        confirmTimerRef.current = null;
        setConfirmTokenId(null);
      }, CONFIRM_LEAVE_MS);
      return;
    }
    clearConfirm();
    onDelist(item);
  };

  return (
    <div className="market-listing-row" role="listitem">
      <Link
        href={useHref}
        scroll={false}
        className={`market-listing-thumb${showThumb ? ' has-media' : ''}`}
        aria-label={`${useAction} ${item.title}`}
      >
        {showThumb ? (
          <img
            src={item.mediaUrl!}
            alt=""
            onError={() => setThumbBroken(true)}
          />
        ) : (
          <span className="market-listing-thumb-fallback" aria-hidden />
        )}
      </Link>
      <div className="market-listing-copy">
        <div className="market-listing-head">
          <p className="market-listing-title">
            <Link
              href={useHref}
              scroll={false}
              className="market-listing-title-link"
            >
              {item.title}
            </Link>
          </p>
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
      <OsSheetActions
        layout="row-compact"
        tone="frosted-primary"
        borderless
        className="market-listing-action"
      >
        {showOffers ? (
          <OsSheetAction
            type="button"
            variant="primary"
            ready
            onClick={() => onOffers?.(item)}
          >
            {offersLabel}
          </OsSheetAction>
        ) : null}
        {needsSettle ? (
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
        ) : listed && !auctionHasBids ? (
          <OsSheetAction
            type="button"
            variant={
              confirmingDelist ? 'danger' : showOffers ? 'ghost' : 'primary'
            }
            ready={!delistPending}
            pending={delistPending}
            pendingLabel={auction ? 'Canceling…' : 'Delisting…'}
            aria-label={
              delistPending
                ? auction
                  ? 'Canceling auction'
                  : 'Delisting'
                : confirmingDelist
                  ? auction
                    ? 'Confirm cancel auction'
                    : 'Confirm delist'
                  : auction
                    ? 'Cancel auction'
                    : 'Delist'
            }
            onClick={handleDelistClick}
            onBlur={confirmingDelist ? clearConfirm : undefined}
          >
            {confirmingDelist
              ? auction
                ? 'Cancel?'
                : 'Delist?'
              : auction
                ? 'Cancel auction'
                : 'Delist'}
          </OsSheetAction>
        ) : listed && auctionHasBids ? null : (
          <OsSheetAction
            type="button"
            variant={showOffers ? 'ghost' : 'primary'}
            ready
            onClick={() => onSell(item)}
          >
            Sell
          </OsSheetAction>
        )}
      </OsSheetActions>
    </div>
  );
}
