/**
 * Series cold-load shell — hero + list bones reserve geometry so the
 * screen does not jump when the catalog settles.
 */
export function SeriesPageSkeleton() {
  return (
    <div
      className="series-page series-page--skeleton"
      aria-busy="true"
      aria-label="Loading series"
      data-series-page-skeleton
    >
      <p className="sr-only">Loading series…</p>
      <header className="series-hero" aria-hidden>
        <div className="series-hero-identity">
          <span className="standing-row-shimmer series-skeleton-logo" />
          <div className="series-hero-copy">
            <span className="standing-row-shimmer series-skeleton-title" />
            <span className="standing-row-shimmer series-skeleton-line-sm" />
          </div>
        </div>
        <div className="series-hero-creator">
          <span className="standing-row-shimmer series-skeleton-avatar" />
          <span className="standing-row-shimmer series-skeleton-creator-name" />
        </div>
      </header>
      <div className="market-listing-list" aria-hidden>
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="market-listing-row market-listing-row--skeleton"
          >
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
        ))}
      </div>
    </div>
  );
}
