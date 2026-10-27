'use client';

import { OsSheetAction, OsSheetActions } from '@onsocial/ui';
import { CatalogThumbImage } from '@/components/ui/catalog-thumb-image';
import { offerListClock } from '@/features/scarces/scarce-offers';
import { socialTimeProps } from '@/lib/post-display';

interface MarketOfferRowProps {
  tokenId: string;
  title: string;
  mediaUrl?: string | null;
  amountNear: string;
  createdAtNs?: number | null;
  expiresAtNs?: number | null;
  nowMs?: number;
  onManage: () => void;
}

/** Delisted-token offer — Buy is gone, so this is the update path. */
export function MarketOfferRow({
  title,
  mediaUrl,
  amountNear,
  createdAtNs = null,
  expiresAtNs = null,
  nowMs,
  onManage,
}: MarketOfferRowProps) {
  const priceLabel = Number.parseFloat(amountNear);
  const priceNear = Number.isFinite(priceLabel)
    ? priceLabel.toLocaleString('en-US', { maximumFractionDigits: 4 })
    : amountNear;
  const clock =
    typeof nowMs === 'number'
      ? offerListClock({ createdAtNs, expiresAtNs }, nowMs)
      : null;

  return (
    <div className="market-listing-row" role="listitem">
      <div
        className={`market-listing-thumb${mediaUrl ? ' has-media' : ''}`}
        aria-hidden
      >
        {mediaUrl ? (
          <CatalogThumbImage src={mediaUrl} />
        ) : (
          <span className="market-listing-thumb-fallback" />
        )}
      </div>
      <div className="market-listing-copy">
        <div className="market-listing-head">
          <p className="market-listing-title">{title}</p>
        </div>
        <p className="market-listing-meta">
          <span className="market-listing-price">Offer · {priceNear} NEAR</span>
          <span className="market-listing-own"> · Not listed</span>
        </p>
      </div>
      <div className="market-listing-action-col">
        {clock ? (
          <time
            className="market-listing-meta-right"
            {...socialTimeProps(clock.atMs)}
          >
            {clock.label}
          </time>
        ) : null}
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
            onClick={onManage}
          >
            Update offer
          </OsSheetAction>
        </OsSheetActions>
      </div>
    </div>
  );
}
