import { COLLECTION_PAGE_SKELETON_CLASS } from '@/lib/os-chrome-page';

/**
 * Drop page cold-load shell. Reserves geometry matching the resolved
 * medium so first paint doesn't jump. When medium is unknown, defaults
 * to general drop geometry.
 */
export interface CollectionPageSkeletonProps {
  isAudio?: boolean;
  isImmersive?: boolean;
}

export function CollectionPageSkeleton({
  isAudio = false,
  isImmersive = true,
}: CollectionPageSkeletonProps = {}) {
  return (
    <div
      className={COLLECTION_PAGE_SKELETON_CLASS}
      aria-busy="true"
      aria-label="Loading drop"
      data-collection-page-skeleton
    >
      <p className="sr-only">Loading drop…</p>
      <section className="collection-hero" aria-hidden>
        <div
          className={`collection-cover has-media${
            isImmersive ? ' is-immersive' : ''
          }${isAudio ? ' is-square' : ''}`}
        >
          <div className="standing-row-shimmer collection-skeleton-cover" />
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

      {isAudio ? (
        <section className="collection-tracks-skeleton" aria-hidden>
          <div className="collection-skeleton-track-list">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="collection-skeleton-track">
                <span className="standing-row-shimmer collection-skeleton-track-play" />
                <span className="standing-row-shimmer collection-skeleton-track-title" />
                <span className="standing-row-shimmer collection-skeleton-track-love" />
              </div>
            ))}
          </div>
        </section>
      ) : (
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
      )}
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
