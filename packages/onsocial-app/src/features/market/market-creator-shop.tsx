'use client';

import Link from 'next/link';
import { standingIdentityLabel } from '@onsocial/ui';
import { StandingIdentity } from '@/components/profile/standing-identity';
import { MarketCreatorDropRow } from '@/features/market/market-creator-drop-row';
import {
  groupMarketCreatorDrops,
  marketCreatorShopCountCopy,
} from '@/features/market/market-creator-view';
import { portfolioPath } from '@/lib/overlay-routes';
import type { ProfileStoreDrop } from '@/lib/profile-store-types';

/** Creator door on `/market?creator=` — identity, then unlisted drops. */
export function MarketCreatorShop({
  creatorId,
  displayName = null,
  avatarUrl = null,
  drops,
  listingCount,
  showDropLabel,
  onMintDrop,
}: {
  creatorId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  drops: readonly ProfileStoreDrop[];
  listingCount: number;
  showDropLabel: boolean;
  onMintDrop: (drop: ProfileStoreDrop) => void;
}) {
  const creatorLabel = standingIdentityLabel(creatorId, displayName).label;
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
            profileName={displayName}
            avatarUrl={avatarUrl}
            size="md"
            copyLeading={
              <span className="market-creator-shop-role">Shop</span>
            }
          >
            {countCopy ? (
              <span className="market-creator-shop-count">{countCopy}</span>
            ) : null}
          </StandingIdentity>
        </div>
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
              <div className="market-listing-list" role="list">
                {group.drops.map((drop) => (
                  <MarketCreatorDropRow
                    key={drop.collectionId}
                    drop={drop}
                    onMint={onMintDrop}
                    showStatus={!showGroupLabels}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </header>
  );
}
