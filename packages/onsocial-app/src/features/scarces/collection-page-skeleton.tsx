/**
 * Drop page cold-load shell — immersive cover + meta + compact body bands
 * reserve final geometry so the screen does not jump when the drop resolves.
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
        <div className="collection-music-hero is-immersive">
          <div className="scarce-clip-player-shell">
            <div className="scarce-clip-player">
              <div className="standing-row-shimmer scarce-clip-player-cover collection-skeleton-cover" />
            </div>
          </div>
        </div>
        <header className="collection-head">
          <div className="standing-row-shimmer collection-skeleton-title" />
          <div className="collection-meta">
            <span className="standing-row-shimmer collection-skeleton-avatar" />
            <div className="collection-meta-copy">
              <span className="standing-row-shimmer collection-skeleton-creator-name" />
              <span className="standing-row-shimmer collection-skeleton-line-sm" />
            </div>
          </div>
        </header>
      </section>

      <section className="collection-tracks" aria-hidden>
        <span className="standing-row-shimmer collection-skeleton-section-label" />
        <div className="collection-skeleton-track-list">
          {Array.from({ length: 3 }, (_, index) => (
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

/** Writing chapter body placeholders — reserve markdown height. */
export function CollectionWritingBodySkeleton({ lines = 5 }: { lines?: number }) {
  return (
    <div
      className="collection-writing-body-skeleton"
      aria-busy="true"
      aria-label="Loading chapter"
    >
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className={`standing-row-shimmer collection-writing-skeleton-line${
            index === lines - 1 ? ' is-short' : ''
          }`}
          aria-hidden
        />
      ))}
    </div>
  );
}
