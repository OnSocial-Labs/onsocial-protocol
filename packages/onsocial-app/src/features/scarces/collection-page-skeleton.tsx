import { COLLECTION_PAGE_SKELETON_CLASS } from '@/lib/os-chrome-page';

/**
 * Drop page cold-load shell. The route does not know the collection medium
 * yet, so this deliberately reserves only geometry shared by every drop.
 * Medium-specific sections are added after the collection view resolves.
 */
export function CollectionPageSkeleton() {
  return (
    <div
      className={COLLECTION_PAGE_SKELETON_CLASS}
      aria-busy="true"
      aria-label="Loading drop"
      data-collection-page-skeleton
    >
      <p className="sr-only">Loading drop…</p>
      <section className="collection-hero" aria-hidden>
        <div className="collection-cover has-media">
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
