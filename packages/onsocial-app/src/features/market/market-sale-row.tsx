'use client';

import Link from 'next/link';
import { DiscoveryPartyStack } from '@/components/discovery/discovery-party-stack';
import { MarketListingRowMenu } from '@/features/market/market-listing-row-menu';
import {
  collectionIdFromTokenId,
  formatMarketRelativeTime,
  type MarketSaleItem,
} from '@/features/market/market-listings';
import {
  marketPostLayerLinkHandlers,
  useMarketPostLayer,
} from '@/features/market/market-post-layer';
import { dollarStickerLabel } from '@/features/scarces/dollar-price';
import { QuantityCount } from '@/features/scarces/quantity-count';
import { appendEach } from '@/features/scarces/quantity-count-format';
import { collectionPath } from '@/lib/app-routes';
import { socialTimeProps } from '@/lib/post-display';

/** Post when the sale has one. Otherwise the drop page for an edition token. */
export function marketSaleDetailHref(
  sale: Pick<MarketSaleItem, 'postHref' | 'tokenId'>
): { href: string; kind: 'post' | 'drop' } | null {
  const postHref = sale.postHref?.trim();
  if (postHref) return { href: postHref, kind: 'post' };
  const collectionId = collectionIdFromTokenId(sale.tokenId ?? '');
  if (!collectionId) return null;
  return { href: collectionPath(collectionId), kind: 'drop' };
}

/** Buyer when the sale names one, otherwise the seller. */
export function salePartyAccountId(
  sale: Pick<MarketSaleItem, 'buyerId' | 'sellerId' | 'creatorId'>
): string {
  return (
    sale.buyerId?.trim() ||
    sale.sellerId?.trim() ||
    sale.creatorId?.trim() ||
    ''
  );
}

/** “bought by” only when the person on the row is the buyer. */
export function salePartyLead(
  sale: Pick<MarketSaleItem, 'buyerId'>
): 'bought by' | false {
  return sale.buyerId?.trim() ? 'bought by' : false;
}

function formatSalePriceNear(priceNear: string, fractionDigits: 2 | 4): string {
  const n = Number.parseFloat(priceNear);
  if (!Number.isFinite(n)) return priceNear;
  return n.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits === 2 ? 2 : 0,
    maximumFractionDigits: fractionDigits,
  });
}

/** Dollar sales use the 2dp earnings face. NEAR sales stay at 4dp like listings. */
export function marketSalePriceLabel(input: {
  usdE6?: string | null;
  priceNear?: string | null;
  quantity?: number | null;
}): string | null {
  const sticker = dollarStickerLabel(input.usdE6);
  const near = input.priceNear?.trim();
  if (!near) return sticker ? appendEach(sticker, input.quantity) : null;
  const amount = formatSalePriceNear(near, sticker ? 2 : 4);
  return appendEach(
    `${sticker ? `${sticker} · ` : ''}${amount} NEAR`,
    input.quantity
  );
}

/** Recent sale in the listing row: buyer, the amount, time and the same ⋮. */
export function MarketSaleRow({
  sale,
  displayName,
  avatarUrl,
}: {
  sale: MarketSaleItem;
  displayName?: string | null;
  avatarUrl?: string | null;
}) {
  const openMarketPost = useMarketPostLayer();
  const partyId = salePartyAccountId(sale);
  const saleTime = formatMarketRelativeTime(sale.blockTimestamp);
  const detail = marketSaleDetailHref(sale);
  const postHandlers = detail
    ? marketPostLayerLinkHandlers(detail.href, openMarketPost)
    : null;
  const priceLine = marketSalePriceLabel(sale);
  const title = sale.title.trim() || 'Scarce';
  const thumbClass = `market-listing-thumb${sale.mediaUrl ? ' has-media' : ''}`;
  const thumbArt = sale.mediaUrl ? (
    <img src={sale.mediaUrl} alt="" />
  ) : (
    <span className="market-listing-thumb-fallback" aria-hidden />
  );

  return (
    <li className="market-listing-row market-sale-row">
      {detail ? (
        <Link
          href={detail.href}
          scroll={false}
          className="market-listing-row-open"
          aria-label={
            detail.kind === 'post'
              ? `Open post for ${title}`
              : `Open drop for ${title}`
          }
          {...(postHandlers ?? {})}
        />
      ) : null}
      <div className={thumbClass} aria-hidden>
        {thumbArt}
      </div>
      <div className="market-listing-copy drops-discovery-copy">
        <div className="market-listing-head drops-discovery-head">
          <p className="market-listing-title">{title}</p>
        </div>
        {partyId ? (
          <DiscoveryPartyStack
            accountId={partyId}
            displayName={displayName}
            avatarUrl={avatarUrl}
            lead={salePartyLead(sale)}
          />
        ) : null}
        {priceLine || sale.quantity ? (
          <p className="market-listing-meta market-listing-meta--price">
            <QuantityCount quantity={sale.quantity} verb="minted" />
            {sale.quantity && sale.quantity > 1 && priceLine ? ' · ' : null}
            {priceLine ? (
              <span className="market-listing-price">{priceLine}</span>
            ) : null}
          </p>
        ) : null}
      </div>
      <div className="market-listing-action-col">
        <div className="drops-discovery-head-trail">
          {saleTime ? (
            <time
              className="market-listing-meta-right"
              {...socialTimeProps(sale.blockTimestamp)}
            >
              {saleTime}
            </time>
          ) : null}
          <MarketListingRowMenu
            item={{
              title,
              tokenId: sale.tokenId,
              mediaUrl: sale.mediaUrl,
              sourcePostPath: sale.sourcePostPath,
            }}
            sharePath={detail?.href ?? null}
          />
        </div>
      </div>
    </li>
  );
}
