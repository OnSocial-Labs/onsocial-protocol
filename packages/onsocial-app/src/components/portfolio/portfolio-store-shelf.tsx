'use client';

import Link from 'next/link';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { MarketSaleRow } from '@/features/market/market-sale-row';
import { collectionPath, marketCreatorPath } from '@/lib/app-routes';
import { postHrefFromSourcePath } from '@/lib/scarce-creator-earnings';
import {
  STORE_LISTING_BADGE,
  storeListingHref,
} from '@/lib/profile-store-links';
import type {
  ProfileStoreDrop,
  ProfileStoreListing,
  ProfileStoreSale,
  ProfileStoreShelf,
} from '@/lib/profile-store-types';

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
  if (!listing.priceNear) return STORE_LISTING_BADGE[listing.kind];
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

function saleToMarketRow(sale: ProfileStoreSale) {
  const postHref = postHrefFromSourcePath(sale.sourcePostPath);
  return {
    title: sale.title,
    priceNear: sale.priceNear ?? '',
    blockTimestamp: sale.blockTimestamp,
    ...(sale.mediaUrl ? { mediaUrl: sale.mediaUrl } : {}),
    ...(sale.buyerId ? { buyerId: sale.buyerId } : {}),
    ...(sale.sourcePostPath ? { sourcePostPath: sale.sourcePostPath } : {}),
    ...(postHref ? { postHref } : {}),
  };
}

export function PortfolioStoreShelf({
  pageAccountId,
  shelf,
}: {
  pageAccountId: string;
  shelf: ProfileStoreShelf;
}) {
  const shopHref = marketCreatorPath(pageAccountId);

  return (
    <div className="portfolio-store">
      {shelf.drops.length > 0 ? (
        <div
          className={`page-drawer-media-rail${
            shelf.drops.length === 1 ? ' is-sparse' : ''
          }`}
          aria-label="Drops"
        >
          {shelf.drops.map((drop) => (
            <Link
              key={drop.key}
              href={collectionPath(drop.collectionId)}
              scroll={false}
              className="page-drawer-media-card group"
              title={drop.title}
            >
              <span
                className={`page-drawer-media-cover${drop.mediaUrl ? ' has-media' : ''}`}
                aria-hidden
              >
                {drop.mediaUrl ? <img src={drop.mediaUrl} alt="" /> : null}
                <span className="page-drawer-media-badge">
                  {DROP_STATUS_LABEL[drop.status]}
                </span>
              </span>
              <span className="page-drawer-media-body">
                <span className="page-drawer-media-title">{drop.title}</span>
                <span className="page-drawer-media-meta">
                  <span className="page-drawer-media-action">
                    {dropPriceLine(drop)}
                  </span>
                </span>
                <span className="page-drawer-media-facts">
                  Drop · {drop.totalSupply - drop.remaining}/{drop.totalSupply}
                </span>
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      {shelf.listings.length > 0 ? (
        <div
          className={`page-drawer-media-rail${
            shelf.listings.length === 1 ? ' is-sparse' : ''
          }`}
          aria-label="For sale now"
        >
          {shelf.listings.map((listing) => {
            const facts = listingFacts(listing);
            return (
              <Link
                key={listing.key}
                href={storeListingHref(listing, pageAccountId)}
                scroll={false}
                className="page-drawer-media-card group"
                title={listing.title}
              >
                <span
                  className={`page-drawer-media-cover${listing.mediaUrl ? ' has-media' : ''}`}
                  aria-hidden
                >
                  {listing.mediaUrl ? (
                    <img src={listing.mediaUrl} alt="" />
                  ) : null}
                  <span className="page-drawer-media-badge">
                    {STORE_LISTING_BADGE[listing.kind]}
                  </span>
                </span>
                <span className="page-drawer-media-body">
                  <span className="page-drawer-media-title">{listing.title}</span>
                  <span className="page-drawer-media-meta">
                    <span className="page-drawer-media-action">
                      {priceLine(listing)}
                    </span>
                  </span>
                  {facts ? (
                    <span className="page-drawer-media-facts">{facts}</span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}

      {shelf.sales.length > 0 ? (
        <ul className="portfolio-store-sales" aria-label="Recent sales">
          {shelf.sales.map((sale) => (
            <MarketSaleRow
              key={sale.key}
              soldTo
              sale={saleToMarketRow(sale)}
            />
          ))}
        </ul>
      ) : null}

      <Link
        className="page-drawer-section-action group"
        href={shopHref}
        scroll={false}
      >
        See all in Market
        <ProtocolMotionArrow className="page-drawer-section-action-arrow" />
      </Link>
    </div>
  );
}
