'use client';

import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';

interface MarketOfferRowProps {
  tokenId: string;
  title: string;
  mediaUrl?: string | null;
  amountNear: string;
  onManage: () => void;
}

/** Open-offer row on Market — extracted from the fat page panel. */
export function MarketOfferRow({
  title,
  mediaUrl,
  amountNear,
  onManage,
}: MarketOfferRowProps) {
  const priceLabel = Number.parseFloat(amountNear);
  const priceNear = Number.isFinite(priceLabel)
    ? priceLabel.toLocaleString('en-US', { maximumFractionDigits: 4 })
    : amountNear;

  return (
    <div className="market-listing-row" role="listitem">
      <div
        className={`market-listing-thumb${mediaUrl ? ' has-media' : ''}`}
        aria-hidden
      >
        {mediaUrl ? (
          <img src={mediaUrl} alt="" />
        ) : (
          <span className="market-listing-thumb-fallback" />
        )}
      </div>
      <div className="market-listing-copy">
        <div className="market-listing-head">
          <p className="market-listing-title">{title}</p>
        </div>
        <p className="market-listing-meta">
          <span className="market-listing-price">
            Offer · {priceNear} NEAR
          </span>
          <span className="market-listing-own"> · Open</span>
        </p>
      </div>
      <OsSheetActions
        layout="row-compact"
        tone="frosted-primary"
        borderless
        className="market-listing-action"
      >
        <OsSheetAction type="button" variant="primary" ready onClick={onManage}>
          Manage
        </OsSheetAction>
      </OsSheetActions>
    </div>
  );
}
