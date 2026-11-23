'use client';

import { useState } from 'react';
import { CatalogThumbImage } from '@/components/ui/catalog-thumb-image';
import {
  marketCreatorDropMetaBits,
  marketCreatorDropMintable,
} from '@/features/market/market-creator-view';
import { collectionCreatorFaceSeed } from '@/features/scarces/collection-creator-face';
import {
  DropPlaceLink,
  seedCollectionViewFromStoreDrop,
} from '@/features/scarces/drop-place-open';
import { collectionPath } from '@/lib/app-routes';
import { OsRowAction } from '@/lib/os-row-action';
import type { ProfileStoreDrop } from '@/lib/profile-store-types';

/** Unlisted creator drop — Mint when live; otherwise the row opens the drop. */
export function MarketCreatorDropRow({
  drop,
  creatorId,
  displayName = null,
  avatarUrl = null,
  onMint,
  showStatus = true,
}: {
  drop: ProfileStoreDrop;
  /** Shop owner — seeds the place face on frame 1. */
  creatorId?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  onMint?: (drop: ProfileStoreDrop) => void;
  showStatus?: boolean;
}) {
  const [brokenMediaUrl, setBrokenMediaUrl] = useState<string | null>(null);
  const showThumb = Boolean(drop.mediaUrl) && brokenMediaUrl !== drop.mediaUrl;
  const mintable = Boolean(onMint) && marketCreatorDropMintable(drop);
  const href = collectionPath(drop.collectionId);
  const dropInitial = seedCollectionViewFromStoreDrop(drop, creatorId);
  const dropCreator = collectionCreatorFaceSeed({ displayName, avatarUrl });
  const meta = marketCreatorDropMetaBits(drop, { includeStatus: showStatus });

  return (
    <div
      className="market-listing-row market-creator-drop-row"
      role="listitem"
      data-market-creator-drop={drop.collectionId}
    >
      <DropPlaceLink
        href={href}
        initial={dropInitial}
        initialCreator={dropCreator}
        className="market-listing-row-open"
        aria-label={mintable ? `Open ${drop.title}` : `Open drop for ${drop.title}`}
      />
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
      <div
        className={`market-listing-action-col collectibles-holding-action-col${
          mintable ? '' : ' is-empty'
        }`}
      >
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
