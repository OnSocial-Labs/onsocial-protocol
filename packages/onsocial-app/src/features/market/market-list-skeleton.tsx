'use client';

interface MarketListSkeletonProps {
  rows?: number;
  variant?: 'market' | 'drops';
}

/** Shimmer — title|trail, then party/meta with optional CTA beside. */
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
            isDrops ? ' drops-discovery-row drops-discovery-row--skeleton' : ''
          }`}
        >
          <span
            className={`standing-row-shimmer market-listing-thumb-shimmer${
              isDrops ? ' drops-discovery-thumb' : ''
            }`}
          />
          <div className="drops-discovery-body">
            <div className="drops-discovery-top">
              <div
                className={`market-listing-head${
                  isDrops ? ' drops-discovery-head' : ''
                }`}
              >
                <span className="standing-row-shimmer standing-row-shimmer-line market-listing-shimmer-title" />
              </div>
              <div
                className={`market-listing-action-col${
                  isDrops ? ' drops-discovery-action-col' : ''
                }`}
              >
                <span className="standing-row-shimmer standing-row-shimmer-line market-listing-shimmer-time" />
              </div>
            </div>
            <div className="drops-discovery-ledger">
              <div className="drops-discovery-stack">
                <span className="standing-row-shimmer standing-row-shimmer-line market-listing-shimmer-identity" />
                <span className="standing-row-shimmer standing-row-shimmer-line market-listing-shimmer-meta" />
              </div>
              {isDrops ? null : (
                <div className="market-listing-action-col">
                  <span className="standing-row-shimmer market-listing-shimmer-action" />
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
