'use client';

import Link from 'next/link';
import { MultiplyIcon, standingIdentityLabel } from '@onsocial/ui';
import { StandingIdentity } from '@/components/profile/standing-identity';
import { MarketCreatorDropRow } from '@/features/market/market-creator-drop-row';
import { portfolioPath } from '@/lib/overlay-routes';
import type { ProfileStoreDrop } from '@/lib/profile-store-types';

/** Creator door on `/market?creator=` — identity, then unlisted drops. */
export function MarketCreatorShop({
  creatorId,
  displayName = null,
  avatarUrl = null,
  drops,
  showDropLabel,
  onClear,
}: {
  creatorId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  drops: readonly ProfileStoreDrop[];
  showDropLabel: boolean;
  onClear: () => void;
}) {
  const creatorLabel = standingIdentityLabel(creatorId, displayName).label;

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
          />
        </div>
        <button
          type="button"
          className="market-creator-filter-clear"
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
          <div className="market-listing-list" role="list">
            {drops.map((drop) => (
              <MarketCreatorDropRow key={drop.collectionId} drop={drop} />
            ))}
          </div>
        </section>
      ) : null}
    </header>
  );
}
