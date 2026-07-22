'use client';

import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import type { OwnedScarceItem } from '@/features/market/market-listings';

interface MarketOwnedRowProps {
  item: OwnedScarceItem;
  delistPending?: boolean;
  onSell: (item: OwnedScarceItem) => void;
  onDelist: (item: OwnedScarceItem) => void;
}

function formatPriceNear(priceNear: string): string {
  const n = Number.parseFloat(priceNear);
  if (!Number.isFinite(n)) return priceNear;
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

/** Owned scarce in Market “Yours” — Sell or Delist when already listed. */
export function MarketOwnedRow({
  item,
  delistPending = false,
  onSell,
  onDelist,
}: MarketOwnedRowProps) {
  const listed = Boolean(item.listedPriceNear?.trim());

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
            <span className="market-listing-own">Listed for resale</span>
          ) : (
            <span className="market-listing-own">Ready to sell</span>
          )}
        </p>
      </div>
      <OsSheetActions
        layout="row-compact"
        tone="frosted-primary"
        borderless
        className="market-listing-action"
      >
        {listed ? (
          <OsSheetAction
            type="button"
            variant="primary"
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
            variant="primary"
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
