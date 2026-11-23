import { COLLECTION_PAGE_SKELETON_CLASS } from '@/lib/os-chrome-page';

/**
 * Drop page cold-load shell. Reserves geometry matching the settled face
 * (party + commerce meter + activity/tracks) so cold open does not grow
 * when the real panel mounts. Medium-unknown defaults to immersive drop.
 */
export interface CollectionPageSkeletonProps {
  isAudio?: boolean;
  isImmersive?: boolean;
  /** `?t=` is on the URL — reserve the edition line under the title. */
  hasEdition?: boolean;
}

export function CollectionPageSkeleton({
  isAudio = false,
  isImmersive = true,
  hasEdition = false,
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
          <div className="collection-title-row">
            <div className="collectibles-play-title-block">
              <span className="standing-row-shimmer collection-skeleton-title" />
              {hasEdition ? (
                <span className="standing-row-shimmer collection-skeleton-line-sm collection-edition-line" />
              ) : null}
            </div>
          </div>
          <div className="drops-discovery-party drops-discovery-party--lead">
            <span className="standing-row-shimmer collection-skeleton-avatar drops-discovery-party-avatar" />
            <span className="drops-discovery-party-stack">
              <span className="standing-row-shimmer collection-skeleton-line drops-discovery-lead" />
              <span className="standing-row-shimmer collection-skeleton-creator-name drops-discovery-by" />
              <span className="standing-row-shimmer collection-skeleton-line-sm drops-discovery-sub" />
            </span>
          </div>
          <div className="collection-about-seat" aria-hidden>
            <span className="standing-row-shimmer collection-about-teaser-line" />
          </div>
          <div
            className={`collection-commerce-actions${
              isAudio ? '' : ' has-fans-seat'
            }`}
          >
            {isAudio ? null : (
              <span className="collection-drop-fans" aria-hidden>
                <span className="drops-discovery-deal-fans">
                  <span className="guild-facepile guild-facepile--stable drops-discovery-fans-facepile">
                    <span
                      className="guild-facepile-avatars guild-facepile-avatars--slots"
                      style={{ ['--guild-facepile-slot-count' as string]: '3' }}
                    >
                      <span className="standing-row-shimmer guild-facepile-avatar-shimmer" />
                      <span className="standing-row-shimmer guild-facepile-avatar-shimmer" />
                      <span className="standing-row-shimmer guild-facepile-avatar-shimmer" />
                    </span>
                    <span className="guild-facepile-count guild-facepile-count--slot">
                      <span
                        className="standing-row-shimmer guild-facepile-count-shimmer"
                        aria-hidden
                      />
                    </span>
                  </span>
                </span>
              </span>
            )}
            <div className="collection-commerce-action-icons">
              <span className="standing-row-shimmer collection-skeleton-icon" />
              <span className="standing-row-shimmer collection-skeleton-icon" />
            </div>
          </div>
          <div className="collection-use-actions" aria-hidden>
            <span className="collection-use-actions-chassis" />
          </div>
          <div className="collection-product-row">
            <span className="standing-row-shimmer collection-skeleton-product-line" />
          </div>
          <div className="collection-progress" />
        </header>
      </section>

      <section className="collection-reading" aria-hidden>
        <div className="collection-reading-row">
          <span className="collection-guest-tally">
            <span className="standing-row-shimmer collection-skeleton-line" />
            <span className="standing-row-shimmer collection-guest-tally-present" />
          </span>
          <span className="standing-row-shimmer collection-skeleton-line-sm" />
        </div>
      </section>

      {isAudio ? (
        <CollectionTracksSkeleton />
      ) : (
        <section className="collection-activity">
          <span className="standing-row-shimmer collection-skeleton-section-label" />
          <div className="collection-activity-seat">
            <CollectionActivitySkeleton rows={3} />
          </div>
        </section>
      )}
    </div>
  );
}

/** Track-list placeholders — same seat as visitor inline tracks. */
export function CollectionTracksSkeleton({
  rows = 4,
  label = 'Loading tracks',
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <section
      className="collection-tracks-skeleton"
      aria-busy="true"
      aria-label={label}
    >
      <span
        className="standing-row-shimmer collection-skeleton-section-label"
        aria-hidden
      />
      <div className="collection-skeleton-track-list">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="collection-skeleton-track" aria-hidden>
            <span className="standing-row-shimmer collection-skeleton-track-play" />
            <span className="standing-row-shimmer collection-skeleton-track-title" />
            <span className="standing-row-shimmer collection-skeleton-track-love" />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Compact activity placeholders while mint history loads. */
export function CollectionActivitySkeleton({
  rows = 3,
  label = 'Loading activity',
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div
      className="collection-skeleton-activity-list"
      aria-busy="true"
      aria-label={label}
    >
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="collection-skeleton-activity-row"
          aria-hidden
        >
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
export function CollectionWritingBodySkeleton({
  lines = 5,
}: {
  lines?: number;
}) {
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
