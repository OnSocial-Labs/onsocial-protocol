'use client';

import { useEffect, useRef, useState } from 'react';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import type { OwnedScarceItem } from '@/features/market/market-listings';

interface MarketOwnedRowProps {
  item: OwnedScarceItem;
  delistPending?: boolean;
  /** Highest open offer (NEAR), when known from the offers catalog. */
  highestOfferNear?: string | null;
  offerCount?: number;
  onSell: (item: OwnedScarceItem) => void;
  onDelist: (item: OwnedScarceItem) => void;
  onOffers?: (item: OwnedScarceItem) => void;
}

function formatPriceNear(priceNear: string): string {
  const n = Number.parseFloat(priceNear);
  if (!Number.isFinite(n)) return priceNear;
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

const CONFIRM_LEAVE_MS = 4_000;

/** Owned scarce in Market “Yours” — the canonical owner-management surface. */
export function MarketOwnedRow({
  item,
  delistPending = false,
  highestOfferNear = null,
  offerCount = 0,
  onSell,
  onDelist,
  onOffers,
}: MarketOwnedRowProps) {
  const listed = item.listingKind != null;
  const auction = item.listingKind === 'auction';
  const showOffers = Boolean(onOffers);
  const hasOffers = offerCount > 0 && Boolean(highestOfferNear?.trim());
  const offersLabel = hasOffers
    ? offerCount > 1
      ? `Offers · ${formatPriceNear(highestOfferNear!)}`
      : `Offer · ${formatPriceNear(highestOfferNear!)}`
    : 'Offers';
  const [confirmTokenId, setConfirmTokenId] = useState<string | null>(null);
  const confirmTimerRef = useRef<number | null>(null);
  const confirmingDelist =
    confirmTokenId === item.tokenId && listed && !delistPending;

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
    if (delistPending) return;
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
      <div
        className={`market-listing-thumb${item.mediaUrl ? ' has-media' : ''}`}
        aria-hidden
      >
        {item.mediaUrl ? (
          <img src={item.mediaUrl} alt="" />
        ) : (
          <span className="market-listing-thumb-fallback" />
        )}
      </div>
      <div className="market-listing-copy">
        <div className="market-listing-head">
          <p className="market-listing-title">{item.title}</p>
          {listed && item.listedPriceNear ? (
            <p className="market-listing-price">
              {auction ? 'Reserve' : 'Ask'} ·{' '}
              {formatPriceNear(item.listedPriceNear)} NEAR
            </p>
          ) : null}
        </div>
        <p className="market-listing-meta">
          {auction ? (
            <span className="market-listing-own">Auction live</span>
          ) : listed ? (
            <span className="market-listing-own">Listed</span>
          ) : (
            <span className="market-listing-own">Ready to sell</span>
          )}
          {hasOffers ? (
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
        {listed ? (
          <OsSheetAction
            type="button"
            variant={
              confirmingDelist ? 'danger' : showOffers ? 'ghost' : 'primary'
            }
            ready={!confirmingDelist && !delistPending}
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
        ) : (
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
