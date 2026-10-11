'use client';

import Link from 'next/link';
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
import { collectionPath } from '@/lib/app-routes';
import { portfolioPath } from '@/lib/overlay-routes';
import { fallbackLabel } from '@/lib/profile-display';

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
}): string | null {
  const sticker = dollarStickerLabel(input.usdE6);
  const near = input.priceNear?.trim();
  if (!near) return sticker;
  const amount = formatSalePriceNear(near, sticker ? 2 : 4);
  return `${sticker ? `${sticker} · ` : ''}${amount} NEAR`;
}

/** Recent-sales list row — shared so Market panel stays lean. */
export function MarketSaleRow({ sale }: { sale: MarketSaleItem }) {
  const openMarketPost = useMarketPostLayer();
  const seller = sale.sellerId?.trim() || sale.creatorId?.trim() || '';
  const saleTime = formatMarketRelativeTime(sale.blockTimestamp);
  const detail = marketSaleDetailHref(sale);
  const postHandlers = detail
    ? marketPostLayerLinkHandlers(detail.href, openMarketPost)
    : null;
  const title = detail ? (
    <Link
      href={detail.href}
      scroll={false}
      className="market-listing-title-link"
      {...(postHandlers ?? {})}
    >
      {sale.title}
    </Link>
  ) : (
    sale.title
  );
  const price = marketSalePriceLabel(sale);
  const thumbClass = `market-listing-thumb${sale.mediaUrl ? ' has-media' : ''}`;
  const thumbArt = sale.mediaUrl ? (
    <img src={sale.mediaUrl} alt="" />
  ) : (
    <span className="market-listing-thumb-fallback" />
  );

  return (
    <li className="market-sale-row">
      {detail ? (
        <Link
          href={detail.href}
          scroll={false}
          className={thumbClass}
          aria-label={
            detail.kind === 'post'
              ? `Open post for ${sale.title}`
              : `Open drop for ${sale.title}`
          }
          {...(postHandlers ?? {})}
        >
          {thumbArt}
        </Link>
      ) : (
        <div className={thumbClass} aria-hidden>
          {thumbArt}
        </div>
      )}
      <div className="market-listing-copy">
        <div className="market-listing-head">
          <p className="market-sale-title">{title}</p>
        </div>
        <p className="market-sale-meta">
          {price ? <span className="market-listing-price">{price}</span> : null}
          {seller ? (
            <>
              <span className="market-listing-own"> · </span>
              <Link
                href={portfolioPath(seller)}
                scroll={false}
                className="market-listing-handle"
              >
                @{fallbackLabel(seller)}
              </Link>
            </>
          ) : (
            <>
              {price ? <span className="market-listing-own"> · </span> : null}
              <span className="market-listing-own">Sale</span>
            </>
          )}
          {saleTime ? ` · ${saleTime}` : ''}
        </p>
      </div>
    </li>
  );
}
