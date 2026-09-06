'use client';

import Link from 'next/link';
import { useState } from 'react';
import { collectionStatusLabel } from '@/features/scarces/collections-data';
import { marketCreatorShopActionLabel } from '@/features/market/market-creator-view';
import { collectionPath } from '@/lib/app-routes';
import type { ProfileStoreDrop } from '@/lib/profile-store-types';

/** Unlisted creator drop — same list row as Market listings, CTA to the drop. */
export function MarketCreatorDropRow({ drop }: { drop: ProfileStoreDrop }) {
  const [brokenMediaUrl, setBrokenMediaUrl] = useState<string | null>(null);
  const showThumb = Boolean(drop.mediaUrl) && brokenMediaUrl !== drop.mediaUrl;
  const action = marketCreatorShopActionLabel(drop.status);
  const href = collectionPath(drop.collectionId);
  const price =
    drop.priceNear != null && drop.priceNear !== '0'
      ? `${drop.priceNear} NEAR`
      : 'Free';

  return (
    <div className="market-listing-row market-creator-drop-row" role="listitem">
      <Link
        href={href}
        scroll={false}
        className="collectibles-holding-row-main"
        title={`${drop.title} · ${action}`}
      >
        <div
          className={`market-listing-thumb${showThumb ? ' has-media' : ''}`}
          aria-hidden
        >
          {showThumb ? (
            <img
              src={drop.mediaUrl!}
              alt=""
              onError={() => setBrokenMediaUrl(drop.mediaUrl ?? null)}
            />
          ) : (
            <span className="market-listing-thumb-fallback" />
          )}
        </div>
        <div className="market-listing-copy">
          <div className="market-listing-head">
            <p className="market-listing-title">{drop.title}</p>
          </div>
          <p className="market-listing-meta">
            <span>{collectionStatusLabel(drop.status)}</span>
            {drop.mediumKind ? (
              <span className="market-listing-own"> · {drop.mediumKind}</span>
            ) : null}
            <span> · {price}</span>
          </p>
        </div>
      </Link>
      <div className="market-listing-action-col collectibles-holding-action-col">
        <Link
          href={href}
          scroll={false}
          className="page-drawer-section-action collectibles-holding-action"
          aria-label={`${action} ${drop.title}`}
        >
          {action}
        </Link>
      </div>
    </div>
  );
}
