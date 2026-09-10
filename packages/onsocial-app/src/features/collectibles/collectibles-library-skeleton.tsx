'use client';

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

/** Use-first row bone — thumb, title, meta, one Play/Read pill. No Market time. */
function HoldingRowBone() {
  return (
    <div className="market-listing-row market-listing-row--skeleton collectibles-holding-row--skeleton">
      <span className="standing-row-shimmer market-listing-thumb-shimmer" />
      <div className="market-listing-copy">
        <div className="market-listing-head">
          <span className="standing-row-shimmer standing-row-shimmer-line market-listing-shimmer-title" />
        </div>
        <span className="standing-row-shimmer standing-row-shimmer-line market-listing-shimmer-meta" />
      </div>
      <div className="market-listing-action-col">
        <span className="standing-row-shimmer market-listing-shimmer-action" />
      </div>
    </div>
  );
}

function HoldingListBone({ rows }: { rows: number }) {
  return (
    <div
      className="market-listing-list market-listing-list--skeleton"
      aria-hidden
    >
      {Array.from({ length: rows }, (_, index) => (
        <HoldingRowBone key={index} />
      ))}
    </div>
  );
}

export function CollectiblesLibraryAppendSkeleton({
  rows = 2,
}: {
  rows?: number;
}) {
  return (
    <div
      className="market-listing-list market-listing-list--skeleton collectibles-library-append-skeleton"
      data-collectibles-library-append-skeleton
      aria-hidden
    >
      {Array.from({ length: rows }, (_, index) => (
        <HoldingRowBone key={index} />
      ))}
    </div>
  );
}

/**
 * Vault open shimmer — creator → series → use rows, not a Market list.
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
          <HoldingListBone rows={3} />
        </div>
      </section>
      <section className="collectibles-library-creator">
        <CreatorHeadingBone />
        <div className="collectibles-library-series">
          <HoldingListBone rows={3} />
        </div>
      </section>
    </div>
  );
}
