'use client';

import Link from 'next/link';
import {
  formatMarketRelativeTime,
  type MarketSaleItem,
} from '@/features/market/market-listings';
import { portfolioPath } from '@/lib/overlay-routes';
import { fallbackLabel } from '@/lib/profile-display';

interface MarketSaleRowProps {
  sale: MarketSaleItem;
}

/** Recent-sales list row — shared so Market panel stays lean. */
export function MarketSaleRow({ sale }: MarketSaleRowProps) {
  const seller = sale.sellerId?.trim() || sale.creatorId?.trim() || '';
  const saleTime = formatMarketRelativeTime(sale.blockTimestamp);
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
    <li className="market-sale-row">
      <div
        className={`market-listing-thumb${sale.mediaUrl ? ' has-media' : ''}`}
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
        </div>
        <p className="market-sale-meta">
          <span className="market-listing-price">{sale.priceNear} NEAR</span>
          <span className="market-listing-own"> · </span>
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
}
