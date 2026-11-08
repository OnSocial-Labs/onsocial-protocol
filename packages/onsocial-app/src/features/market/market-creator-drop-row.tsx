'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CatalogThumbImage } from '@/components/ui/catalog-thumb-image';
import {
  marketCreatorDropMetaBits,
  marketCreatorDropMintable,
} from '@/features/market/market-creator-view';
import { collectionPath } from '@/lib/app-routes';
import { OsRowAction } from '@/lib/os-row-action';
import type { ProfileStoreDrop } from '@/lib/profile-store-types';

/** Unlisted creator drop — Mint when live; otherwise the row opens the drop. */
export function MarketCreatorDropRow({
  drop,
  onMint,
  showStatus = true,
}: {
  drop: ProfileStoreDrop;
  onMint?: (drop: ProfileStoreDrop) => void;
  showStatus?: boolean;
}) {
  const [brokenMediaUrl, setBrokenMediaUrl] = useState<string | null>(null);
  const showThumb = Boolean(drop.mediaUrl) && brokenMediaUrl !== drop.mediaUrl;
  const mintable = Boolean(onMint) && marketCreatorDropMintable(drop);
  const href = collectionPath(drop.collectionId);
  const meta = marketCreatorDropMetaBits(drop, { includeStatus: showStatus });

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
        title={mintable ? `Mint ${drop.title}` : drop.title}
      >
        <div
          className={`market-listing-thumb${showThumb ? ' has-media' : ''}`}
          aria-hidden
        >
          {showThumb ? (
            <CatalogThumbImage
              src={drop.mediaUrl!}
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
          {meta.length > 0 ? (
            <p className="market-listing-meta">{meta.join(' · ')}</p>
          ) : null}
        </div>
      </Link>
      <div className="market-listing-action-col collectibles-holding-action-col">
        {mintable ? (
          <OsRowAction
            className="collectibles-holding-action"
            aria-label={`Mint ${drop.title}`}
            onClick={() => onMint?.(drop)}
          >
            Mint
          </OsRowAction>
        ) : null}
      </div>
    </div>
  );
}
