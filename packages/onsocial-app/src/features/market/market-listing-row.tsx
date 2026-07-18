'use client';

import Link from 'next/link';
import type { MarketListingItem } from '@/features/market/market-listings';
import { portfolioPath } from '@/lib/overlay-routes';
import { fallbackLabel } from '@/lib/profile-display';

interface MarketListingRowProps {
  item: MarketListingItem;
  isOwnListing?: boolean;
  onBuy: (item: MarketListingItem) => void;
}

function formatPriceNear(priceNear: string): string {
  const n = Number.parseFloat(priceNear);
  if (!Number.isFinite(n)) return priceNear;
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

export function MarketListingRow({
  item,
  isOwnListing = false,
  onBuy,
}: MarketListingRowProps) {
  const handle = fallbackLabel(item.creatorId);
  const profileHref = portfolioPath(item.creatorId);

  return (
    <div className="market-listing-row">
      <button
        type="button"
        className={`market-listing-thumb${item.mediaUrl ? ' has-media' : ''}`}
        onClick={() => {
          if (!isOwnListing) onBuy(item);
        }}
        disabled={isOwnListing}
        aria-label={
          isOwnListing ? `${item.title} (your listing)` : `Buy ${item.title}`
        }
      >
        {item.mediaUrl ? (
          <img src={item.mediaUrl} alt="" />
        ) : (
          <span className="market-listing-thumb-fallback" aria-hidden />
        )}
      </button>
      <div className="market-listing-copy">
        <div className="market-listing-head">
          <p className="market-listing-title">{item.title}</p>
          <p className="market-listing-price">
            {formatPriceNear(item.priceNear)} NEAR
          </p>
        </div>
        <p className="market-listing-meta">
          <Link
            href={profileHref}
            scroll={false}
            className="market-listing-handle"
          >
            @{handle}
          </Link>
          {isOwnListing ? (
            <span className="market-listing-own"> · Yours</span>
          ) : null}
        </p>
      </div>
      {isOwnListing ? (
        <span className="market-listing-buy market-listing-buy--muted">
          Listed
        </span>
      ) : (
        <button
          type="button"
          className="market-listing-buy"
          onClick={() => onBuy(item)}
        >
          Buy
        </button>
      )}
    </div>
  );
}
