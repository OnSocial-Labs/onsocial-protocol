'use client';

import Link from 'next/link';
import { useMemo, useRef } from 'react';
import { MultiplyIcon, standingIdentityLabel } from '@onsocial/ui';
import { StandingIdentity } from '@/components/profile/standing-identity';
import { MarketCreatorDropRow } from '@/features/market/market-creator-drop-row';
import { useFeedWindow } from '@/features/home/use-feed-window';
import { CATALOG_ANCHOR_QUERY } from '@/features/home/home-feed-scroll-anchor';
import {
  groupMarketCreatorDrops,
  marketCreatorShopCountCopy,
} from '@/features/market/market-creator-view';
import { collectionCreatorNameLine } from '@/features/scarces/collection-creator-face';
import { portfolioPath } from '@/lib/overlay-routes';
import type { ProfileStoreDrop } from '@/lib/profile-store-types';

/** One creator-shop bucket list, windowed per bucket. */
function MarketCreatorDropGroupList({
  drops,
  onMintDrop,
  showStatus,
}: {
  drops: readonly ProfileStoreDrop[];
  onMintDrop: (drop: ProfileStoreDrop) => void;
  showStatus: boolean;
}) {
  const keys = useMemo(() => drops.map((drop) => drop.collectionId), [drops]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const { windowed, start, end, topSpacer, bottomSpacer, registerRow } =
    useFeedWindow({
      keys,
      hostRef: listRef,
      anchorQuery: CATALOG_ANCHOR_QUERY,
      estimate: 112,
    });

  return (
    <div ref={listRef} className="market-listing-list" role="list">
      {windowed && topSpacer > 0 ? (
        <div
          style={{ height: topSpacer }}
          aria-hidden="true"
          data-feed-window-spacer="top"
        />
      ) : null}
      {drops.slice(start, end).map((drop) => (
        <div
          key={drop.collectionId}
          ref={registerRow(drop.collectionId)}
          data-catalog-key={drop.collectionId}
        >
          <MarketCreatorDropRow
            drop={drop}
            onMint={onMintDrop}
            showStatus={showStatus}
          />
        </div>
      ))}
      {windowed && bottomSpacer > 0 ? (
        <div
          style={{ height: bottomSpacer }}
          aria-hidden="true"
          data-feed-window-spacer="bottom"
        />
      ) : null}
    </div>
  );
}

/** Creator door on `/market?creator=` — identity, then unlisted drops. */
export function MarketCreatorShop({
  creatorId,
  displayName = null,
  avatarUrl = null,
  drops,
  listingCount,
  showDropLabel,
  onMintDrop,
  onClear,
}: {
  creatorId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  drops: readonly ProfileStoreDrop[];
  listingCount: number;
  showDropLabel: boolean;
  onMintDrop: (drop: ProfileStoreDrop) => void;
  /** Leave this shop for the full Market catalog. */
  onClear: () => void;
}) {
  const creatorNameLine = collectionCreatorNameLine(creatorId, displayName);
  const creatorLabel = standingIdentityLabel(creatorId, creatorNameLine).label;
  const groups = groupMarketCreatorDrops(drops);
  const showGroupLabels = groups.length > 1;
  const countCopy = marketCreatorShopCountCopy({
    dropCount: drops.length,
    listingCount,
  });

  return (
    <header className="market-creator-shop">
      <div className="standing-row market-creator-shop-identity">
        <div className="standing-row-main">
          <Link
            href={portfolioPath(creatorId)}
            className="standing-row-hit"
            scroll={false}
            aria-label={`View ${creatorLabel}'s profile`}
          />
          <StandingIdentity
            accountId={creatorId}
            profileName={creatorNameLine}
            avatarUrl={avatarUrl}
            size="md"
          >
            {countCopy ? (
              <span className="market-creator-shop-count">{countCopy}</span>
            ) : null}
          </StandingIdentity>
        </div>
        <button
          type="button"
          className="market-creator-filter-clear market-creator-shop-clear"
          onClick={onClear}
          aria-label="Clear creator filter"
        >
          <MultiplyIcon aria-hidden />
        </button>
      </div>
      {drops.length > 0 ? (
        <section className="market-creator-shop-drops" aria-label="Drops">
          {showDropLabel ? (
            <p className="collection-section-label">Drops</p>
          ) : null}
          {groups.map((group) => (
            <div
              key={group.bucket}
              className="market-creator-shop-group"
              data-market-creator-group={group.bucket}
            >
              {showGroupLabels ? (
                <p className="collection-section-label">{group.label}</p>
              ) : null}
              <MarketCreatorDropGroupList
                drops={group.drops}
                onMintDrop={onMintDrop}
                showStatus={!showGroupLabels}
              />
            </div>
          ))}
        </section>
      ) : null}
    </header>
  );
}
