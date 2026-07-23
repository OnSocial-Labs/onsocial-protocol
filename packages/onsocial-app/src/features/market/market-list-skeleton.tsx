'use client';

interface MarketListSkeletonProps {
  rows?: number;
}

/** Shimmer placeholders for Market listing / sales rows. */
export function MarketListSkeleton({ rows = 5 }: MarketListSkeletonProps) {
  return (
    <div
      className="market-listing-list market-listing-list--skeleton"
      aria-hidden
    >
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="market-listing-row market-listing-row--skeleton"
        >
          <span className="standing-row-shimmer market-listing-thumb-shimmer" />
          <div className="market-listing-copy">
            <div className="market-listing-head">
              <span className="standing-row-shimmer standing-row-shimmer-line market-listing-shimmer-title" />
              <span className="standing-row-shimmer standing-row-shimmer-line market-listing-shimmer-price" />
            </div>
            <span className="standing-row-shimmer standing-row-shimmer-line market-listing-shimmer-meta" />
          </div>
          <span className="standing-row-shimmer market-listing-shimmer-action" />
        </div>
      ))}
    </div>
  );
}
