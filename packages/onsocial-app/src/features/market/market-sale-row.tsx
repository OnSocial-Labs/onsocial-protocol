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
  /**
   * Store peek — the page owner is the seller, so lead with Sold + buyer
   * instead of repeating the profile.
   */
  soldTo?: boolean;
}

/** Recent-sales list row — shared so Market panel stays lean. */
export function MarketSaleRow({ sale, soldTo = false }: MarketSaleRowProps) {
  const seller = sale.sellerId?.trim() || sale.creatorId?.trim() || '';
  const buyer = sale.buyerId?.trim() || '';
  const counterpart = soldTo ? buyer : seller;
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
  const price = sale.priceNear?.trim()
    ? `${sale.priceNear.trim()} NEAR`
    : null;

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
          {soldTo ? <span className="market-listing-own">Sold</span> : null}
          {soldTo && price ? (
            <span className="market-listing-own"> · </span>
          ) : null}
          {price ? (
            <span className="market-listing-price">{price}</span>
          ) : null}
          {counterpart ? (
            <>
              <span className="market-listing-own"> · </span>
              <Link
                href={portfolioPath(counterpart)}
                scroll={false}
                className="market-listing-handle"
              >
                @{fallbackLabel(counterpart)}
              </Link>
            </>
          ) : !soldTo ? (
            <>
              {price ? <span className="market-listing-own"> · </span> : null}
              <span className="market-listing-own">Sale</span>
            </>
          ) : null}
          {saleTime ? ` · ${saleTime}` : ''}
        </p>
      </div>
    </li>
  );
}
