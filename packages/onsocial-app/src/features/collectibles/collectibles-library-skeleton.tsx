'use client';

import { MarketListSkeleton } from '@/features/market/market-list-skeleton';

function CreatorHeadingBone() {
  return (
    <div className="collectibles-library-heading collectibles-library-heading--skeleton">
      <span className="standing-row-shimmer collectibles-library-heading-face collectibles-library-heading-face--skeleton" />
      <span className="standing-row-shimmer collectibles-library-heading-name-bone" />
      <span className="standing-row-shimmer collectibles-library-heading-count-bone" />
    </div>
  );
}

function SeriesHeadingBone() {
  return (
    <div className="collectibles-library-series-heading collectibles-library-series-heading--skeleton">
      <span className="standing-row-shimmer collectibles-library-heading-name-bone" />
      <span className="standing-row-shimmer collectibles-library-heading-count-bone" />
    </div>
  );
}

/**
 * Vault open shimmer — creator → series → rows, not a flat Market list.
 * Two groups, six rows: same count as the old Market skeleton.
 */
export function CollectiblesLibrarySkeleton() {
  return (
    <div
      className="collectibles-library-stack"
      data-collectibles-library-skeleton
      aria-hidden
    >
      <section className="collectibles-library-creator">
        <CreatorHeadingBone />
        <div className="collectibles-library-series">
          <SeriesHeadingBone />
          <MarketListSkeleton rows={3} />
        </div>
      </section>
      <section className="collectibles-library-creator">
        <CreatorHeadingBone />
        <div className="collectibles-library-series">
          <MarketListSkeleton rows={3} />
        </div>
      </section>
    </div>
  );
}
