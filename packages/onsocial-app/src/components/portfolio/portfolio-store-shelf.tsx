'use client';

import Link from 'next/link';
import { ShopFillIcon } from '@onsocial/ui';
import { collectionPath, marketCreatorPath } from '@/lib/app-routes';
import { formatMarketRelativeTime } from '@/features/market/market-listings';
import { fallbackLabel } from '@/lib/profile-display';
import type {
  ProfileStoreDrop,
  ProfileStoreListing,
  ProfileStoreShelf,
} from '@/lib/profile-store-types';

const KIND_TAG: Record<ProfileStoreListing['kind'], string> = {
  lazy: 'Edition',
  native: 'Fixed',
  auction: 'Auction',
};

const DROP_STATUS_LABEL: Record<ProfileStoreDrop['status'], string> = {
  upcoming: 'Soon',
  live: 'Live',
  sold_out: 'Sold out',
  ended: 'Ended',
  paused: 'Paused',
  cancelled: 'Cancelled',
};

function dropPriceLine(drop: ProfileStoreDrop): string {
  if (drop.status === 'sold_out') return 'Sold out';
  const price = drop.priceNear ? `${drop.priceNear} NEAR` : 'Free';
  return `${price} · ${drop.remaining} left`;
}

function priceLine(listing: ProfileStoreListing): string {
  if (!listing.priceNear) return KIND_TAG[listing.kind];
  if (listing.priceLabel === 'From') return `From ${listing.priceNear} NEAR`;
  if (listing.priceLabel === 'Ask') return `${listing.priceNear} NEAR`;
  return `${listing.priceLabel} · ${listing.priceNear} NEAR`;
}

function listingFacts(listing: ProfileStoreListing): string | null {
  if (listing.kind === 'auction') {
    const bids = listing.bidCount ?? 0;
    return bids > 0 ? (bids === 1 ? '1 bid' : `${bids} bids`) : 'No bids yet';
  }
  if (listing.kind === 'lazy' && listing.remaining != null) {
    return listing.remaining === 1
      ? '1 left'
      : `${listing.remaining} left`;
  }
  return null;
}

export function PortfolioStoreShelf({
  pageAccountId,
  shelf,
}: {
  pageAccountId: string;
  shelf: ProfileStoreShelf;
}) {
  const shopHref = marketCreatorPath(pageAccountId);
  const shopLabel = shelf.hasMore ? 'Shop all in Market' : 'Open in Market';

  return (
    <div className="portfolio-store">
      {shelf.drops.length > 0 ? (
        <div className="portfolio-store-rail" aria-label="Drops">
          {shelf.drops.map((drop) => (
            <Link
              key={drop.key}
              href={collectionPath(drop.collectionId)}
              scroll={false}
              className="portfolio-store-card group"
              title={drop.title}
            >
              <span
                className={`portfolio-store-cover${drop.mediaUrl ? ' has-media' : ''}`}
                aria-hidden
              >
                {drop.mediaUrl ? <img src={drop.mediaUrl} alt="" /> : null}
                <span className="portfolio-store-kind">
                  {DROP_STATUS_LABEL[drop.status]}
                </span>
              </span>
              <span className="portfolio-store-body">
                <span className="portfolio-store-title">{drop.title}</span>
                <span className="portfolio-store-price">
                  {dropPriceLine(drop)}
                </span>
                <span className="portfolio-store-facts">
                  Drop · {drop.totalSupply - drop.remaining}/{drop.totalSupply}
                </span>
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      {shelf.listings.length > 0 ? (
        <div className="portfolio-store-rail" aria-label="For sale now">
          {shelf.listings.map((listing) => {
            const facts = listingFacts(listing);
            return (
              <Link
                key={listing.key}
                href={shopHref}
                scroll={false}
                className="portfolio-store-card group"
                title={listing.title}
              >
                <span
                  className={`portfolio-store-cover${listing.mediaUrl ? ' has-media' : ''}`}
                  aria-hidden
                >
                  {listing.mediaUrl ? (
                    <img src={listing.mediaUrl} alt="" />
                  ) : null}
                  <span className="portfolio-store-kind">
                    {KIND_TAG[listing.kind]}
                  </span>
                </span>
                <span className="portfolio-store-body">
                  <span className="portfolio-store-title">{listing.title}</span>
                  <span className="portfolio-store-price">
                    {priceLine(listing)}
                  </span>
                  {facts ? (
                    <span className="portfolio-store-facts">{facts}</span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}

      {shelf.sales.length > 0 ? (
        <ul className="portfolio-store-sales" aria-label="Recent sales">
          {shelf.sales.map((sale) => {
            const time = formatMarketRelativeTime(sale.blockTimestamp);
            return (
              <li key={sale.key} className="portfolio-store-sale">
                <span className="portfolio-store-sale-title">{sale.title}</span>
                <span className="portfolio-store-sale-meta">
                  {sale.priceNear ? (
                    <span className="portfolio-store-sale-price">
                      {sale.priceNear} NEAR
                    </span>
                  ) : null}
                  {sale.buyerId ? (
                    <span className="portfolio-store-sale-buyer">
                      → @{fallbackLabel(sale.buyerId)}
                    </span>
                  ) : null}
                  {time ? (
                    <span className="portfolio-store-sale-time">{time}</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      <Link className="page-drawer-section-action" href={shopHref} scroll={false}>
        <ShopFillIcon className="portfolio-store-cta-icon" aria-hidden />
        {shopLabel}
      </Link>
    </div>
  );
}
