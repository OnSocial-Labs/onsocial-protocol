'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  collectionStatusLabel,
  deriveCollectionStatus,
  type CollectionView,
} from '@/features/scarces/collections-data';
import { seriesShopActionLabel } from '@/features/scarces/series-page-view';
import { collectionPath } from '@/lib/app-routes';

/** Unheld series drop — same list row as the vault, shop CTA to the drop. */
export function SeriesShopRow({
  view,
  nowMs,
}: {
  view: CollectionView;
  nowMs?: number;
}) {
  const [brokenMediaUrl, setBrokenMediaUrl] = useState<string | null>(null);
  const showThumb = Boolean(view.mediaUrl) && brokenMediaUrl !== view.mediaUrl;
  const status = deriveCollectionStatus(view, nowMs);
  const action = seriesShopActionLabel(status);
  const href = collectionPath(view.collectionId);
  const price =
    view.priceNear != null && view.priceNear !== '0'
      ? `${view.priceNear} NEAR`
      : 'Free';
  const supply =
    view.totalSupply > 0 ? `${view.minted}/${view.totalSupply}` : null;

  return (
    <div className="market-listing-row series-shop-row" role="listitem">
      <Link
        href={href}
        scroll={false}
        className="collectibles-holding-row-main"
        title={`${view.title} · ${action}`}
      >
        <div
          className={`market-listing-thumb${showThumb ? ' has-media' : ''}`}
          aria-hidden
        >
          {showThumb ? (
            <img
              src={view.mediaUrl!}
              alt=""
              onError={() => setBrokenMediaUrl(view.mediaUrl ?? null)}
            />
          ) : (
            <span className="market-listing-thumb-fallback" />
          )}
        </div>
        <div className="market-listing-copy">
          <div className="market-listing-head">
            <p className="market-listing-title">{view.title}</p>
          </div>
          <p className="market-listing-meta">
            <span>{collectionStatusLabel(status)}</span>
            {view.kind ? (
              <span className="market-listing-own"> · {view.kind}</span>
            ) : null}
            <span> · {price}</span>
            {supply ? <span> · {supply}</span> : null}
          </p>
        </div>
      </Link>
      <div className="market-listing-action-col collectibles-holding-action-col">
        <Link
          href={href}
          scroll={false}
          className="page-drawer-section-action collectibles-holding-action"
          aria-label={`${action} ${view.title}`}
        >
          {action}
        </Link>
      </div>
    </div>
  );
}
