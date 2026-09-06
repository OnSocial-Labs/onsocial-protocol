'use client';

import Link from 'next/link';
import { useState } from 'react';
import { OsSheetAction, OsSheetActions } from '@onsocial/ui';
import { collectionStatusLabel } from '@/features/scarces/collections-data';
import {
  marketCreatorDropMintable,
  marketCreatorShopActionLabel,
} from '@/features/market/market-creator-view';
import { collectionPath } from '@/lib/app-routes';
import type { ProfileStoreDrop } from '@/lib/profile-store-types';

/** Unlisted creator drop — same list row as Market listings. */
export function MarketCreatorDropRow({
  drop,
  onMint,
}: {
  drop: ProfileStoreDrop;
  onMint?: (drop: ProfileStoreDrop) => void;
}) {
  const [brokenMediaUrl, setBrokenMediaUrl] = useState<string | null>(null);
  const showThumb = Boolean(drop.mediaUrl) && brokenMediaUrl !== drop.mediaUrl;
  const action = marketCreatorShopActionLabel(drop);
  const mintable = Boolean(onMint) && marketCreatorDropMintable(drop);
  const href = collectionPath(drop.collectionId);
  const price =
    drop.priceNear != null && drop.priceNear !== '0'
      ? `${drop.priceNear} NEAR`
      : 'Free';

  return (
    <div
      className="market-listing-row market-creator-drop-row"
      role="listitem"
      data-market-creator-drop={drop.collectionId}
    >
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
        {mintable ? (
          <OsSheetActions
            layout="row-compact"
            tone="frosted-primary"
            size="sm"
            borderless
            className="market-listing-action collectibles-holding-action"
          >
            <OsSheetAction
              type="button"
              variant="primary"
              ready
              aria-label={`${action} ${drop.title}`}
              onClick={() => onMint?.(drop)}
            >
              {action}
            </OsSheetAction>
          </OsSheetActions>
        ) : (
          <Link
            href={href}
            scroll={false}
            className="page-drawer-section-action collectibles-holding-action"
            aria-label={`${action} ${drop.title}`}
          >
            {action}
          </Link>
        )}
      </div>
    </div>
  );
}
