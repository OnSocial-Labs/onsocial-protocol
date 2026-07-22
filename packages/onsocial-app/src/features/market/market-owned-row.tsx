'use client';

import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import type { OwnedScarceItem } from '@/features/market/market-listings';

interface MarketOwnedRowProps {
  item: OwnedScarceItem;
  offerCount?: number;
  delistPending?: boolean;
  onSell: (item: OwnedScarceItem) => void;
  onDelist: (item: OwnedScarceItem) => void;
  onOffers?: (item: OwnedScarceItem) => void;
}

function formatPriceNear(priceNear: string): string {
  const n = Number.parseFloat(priceNear);
  if (!Number.isFinite(n)) return priceNear;
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

/** Owned scarce in Market “Yours” — Sell, Offers, or Delist when listed. */
export function MarketOwnedRow({
  item,
  offerCount = 0,
  delistPending = false,
  onSell,
  onDelist,
  onOffers,
}: MarketOwnedRowProps) {
  const listed = Boolean(item.listedPriceNear?.trim());
  const showOffers = Boolean(onOffers) && offerCount > 0;

  return (
    <div className="market-listing-row">
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
              {formatPriceNear(item.listedPriceNear)} NEAR
            </p>
          ) : null}
        </div>
        <p className="market-listing-meta">
          {listed ? (
            <span className="market-listing-own">Listed</span>
          ) : (
            <span className="market-listing-own">Ready to sell</span>
          )}
          {offerCount > 0 ? (
            <span className="market-listing-own">
              {' · '}
              {offerCount === 1 ? '1 offer' : `${offerCount} offers`}
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
            {offerCount === 1 ? '1 offer' : `${offerCount} offers`}
          </OsSheetAction>
        ) : null}
        {listed ? (
          <OsSheetAction
            type="button"
            variant={showOffers ? 'ghost' : 'primary'}
            ready={!delistPending}
            pending={delistPending}
            pendingLabel="Delisting…"
            onClick={() => onDelist(item)}
          >
            Delist
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
