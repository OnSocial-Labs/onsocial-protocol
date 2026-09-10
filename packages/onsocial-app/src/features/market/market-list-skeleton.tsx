'use client';

interface MarketListSkeletonProps {
  rows?: number;
  variant?: 'market' | 'drops';
}

/** Shimmer placeholders for Market listing / sales rows. */
export function MarketListSkeleton({
  rows = 5,
  variant = 'market',
}: MarketListSkeletonProps) {
  const isDrops = variant === 'drops';

  return (
    <div
      className="market-listing-list market-listing-list--skeleton"
      aria-hidden
    >
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className={`market-listing-row market-listing-row--skeleton${
            isDrops ? ' drops-discovery-row' : ''
          }`}
        >
          <span
            className={`standing-row-shimmer market-listing-thumb-shimmer${
              isDrops ? ' drops-discovery-thumb' : ''
            }`}
          />
          <div
            className={`market-listing-copy${
              isDrops ? ' drops-discovery-copy' : ''
            }`}
          >
            <div
              className={`market-listing-head${
                isDrops ? ' drops-discovery-head' : ''
              }`}
            >
              <span className="standing-row-shimmer standing-row-shimmer-line market-listing-shimmer-title" />
            </div>
            <span className="standing-row-shimmer standing-row-shimmer-line market-listing-shimmer-identity" />
            <span className="standing-row-shimmer standing-row-shimmer-line market-listing-shimmer-meta" />
          </div>
          <div
            className={`market-listing-action-col${
              isDrops ? ' drops-discovery-action-col' : ''
            }`}
          >
            <span className="standing-row-shimmer standing-row-shimmer-line market-listing-shimmer-time" />
            <span className="standing-row-shimmer market-listing-shimmer-action" />
          </div>
        </div>
      ))}
    </div>
  );
}
