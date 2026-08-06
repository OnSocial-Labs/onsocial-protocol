/**
 * Drop page cold-load shell — geometry matches collection hero + tracks + mint band.
 */
export function CollectionPageSkeleton() {
  return (
    <div
      className="collection-page collection-page--skeleton"
      aria-busy="true"
      aria-label="Loading drop"
    >
      <p className="sr-only">Loading drop…</p>
      <section className="collection-hero" aria-hidden>
        <div className="collection-music-hero">
          <div className="standing-row-shimmer collection-skeleton-cover" />
        </div>
        <header className="collection-head">
          <div className="standing-row-shimmer collection-skeleton-title" />
          <div className="collection-meta">
            <span className="standing-row-shimmer collection-skeleton-avatar" />
            <div className="collection-meta-copy">
              <span className="standing-row-shimmer collection-skeleton-line" />
              <span className="standing-row-shimmer collection-skeleton-line-sm" />
            </div>
          </div>
        </header>
      </section>

      <section className="collection-tracks" aria-hidden>
        <span className="standing-row-shimmer collection-skeleton-section-label" />
        <div className="collection-skeleton-track-list">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="collection-skeleton-track">
              <span className="standing-row-shimmer collection-skeleton-track-play" />
              <span className="standing-row-shimmer collection-skeleton-track-title" />
              <span className="standing-row-shimmer collection-skeleton-track-love" />
            </div>
          ))}
        </div>
      </section>

      <section className="collection-activity" aria-hidden>
        <span className="standing-row-shimmer collection-skeleton-section-label" />
        <div className="collection-skeleton-activity-list">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="collection-skeleton-activity-row">
              <span className="standing-row-shimmer collection-skeleton-activity-avatar" />
              <div className="collection-skeleton-activity-copy">
                <span className="standing-row-shimmer collection-skeleton-line" />
                <span className="standing-row-shimmer collection-skeleton-line-sm" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="collection-skeleton-mint" aria-hidden>
        <span className="standing-row-shimmer collection-skeleton-line" />
        <span className="standing-row-shimmer collection-skeleton-progress" />
        <span className="standing-row-shimmer collection-skeleton-mint-btn" />
      </section>
    </div>
  );
}

/** Compact activity placeholders while mint history loads. */
export function CollectionActivitySkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div
      className="collection-skeleton-activity-list"
      aria-busy="true"
      aria-label="Loading activity"
    >
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="collection-skeleton-activity-row" aria-hidden>
          <span className="standing-row-shimmer collection-skeleton-activity-avatar" />
          <div className="collection-skeleton-activity-copy">
            <span className="standing-row-shimmer collection-skeleton-line" />
            <span className="standing-row-shimmer collection-skeleton-line-sm" />
          </div>
        </div>
      ))}
    </div>
  );
}
