'use client';

export type PostSkeletonFrame =
  | 'text'
  | 'single'
  | 'collage-2'
  | 'collage-3'
  | 'collage-4'
  | 'quote';

/** Home cold load — one frame per row, same boxes the live cards reserve. */
export const HOME_FEED_COLD_SKELETON_FRAMES = [
  'single',
  'quote',
  'collage-2',
  'collage-4',
] as const satisfies readonly PostSkeletonFrame[];

/** Next page — same reserved media boxes, shorter list. */
export const HOME_FEED_APPEND_SKELETON_FRAMES = [
  'single',
  'collage-2',
] as const satisfies readonly PostSkeletonFrame[];

function PostSkeletonMedia({ frame }: { frame: PostSkeletonFrame }) {
  if (frame === 'text') return null;
  if (frame === 'quote') {
    return (
      <div className="post-row-skeleton-quote">
        <div className="standing-row-shimmer post-row-skeleton-quote-thumb" />
        <div className="post-row-skeleton-quote-copy">
          <div className="standing-row-shimmer post-row-skeleton-line" />
          <div className="standing-row-shimmer post-row-skeleton-line-sm" />
        </div>
      </div>
    );
  }
  if (frame === 'single') {
    return (
      <div className="post-row-skeleton-media post-row-skeleton-media--single">
        <div className="standing-row-shimmer post-row-skeleton-media-fill" />
      </div>
    );
  }
  const cells = frame === 'collage-2' ? 2 : frame === 'collage-3' ? 3 : 4;
  return (
    <div
      className={`post-row-skeleton-media post-row-skeleton-media--${frame}`}
    >
      {Array.from({ length: cells }, (_, cell) => (
        <div
          key={cell}
          className="standing-row-shimmer post-row-skeleton-media-cell"
        />
      ))}
    </div>
  );
}

export function PostRowSkeleton({
  rows = 3,
  /** Reserve the room row under identity (guild All feed) so posts don’t jump. */
  showChannel = false,
  /**
   * Per-row frame. Omitted rows stay text-only so other feeds keep their
   * current skeleton height.
   */
  frames,
}: {
  rows?: number;
  showChannel?: boolean;
  frames?: readonly PostSkeletonFrame[];
}) {
  return (
    <div className="post-row-skeleton-list" aria-hidden>
      {Array.from({ length: rows }, (_, index) => {
        const frame = frames?.[index] ?? 'text';
        return (
          <div key={index}>
            {index > 0 ? (
              <div className="post-row-skeleton-divider" aria-hidden />
            ) : null}
            <div className="post-card post-card--skeleton">
              <div className="post-card-avatar post-row-skeleton-avatar standing-row-shimmer" />
              <div className="post-card-copy">
                {/* One identity row — matches live Name @handle · time. */}
                <div className="post-row-skeleton-identity">
                  <div className="standing-row-shimmer post-row-skeleton-line" />
                  <div className="standing-row-shimmer post-row-skeleton-line-sm" />
                </div>
                {showChannel ? (
                  <div className="standing-row-shimmer post-row-skeleton-channel" />
                ) : null}
                <div className="standing-row-shimmer post-row-skeleton-line-body" />
                <PostSkeletonMedia frame={frame} />
                {frame === 'text' ? null : (
                  <div className="post-row-skeleton-actions">
                    <div className="standing-row-shimmer post-row-skeleton-action" />
                    <div className="standing-row-shimmer post-row-skeleton-action" />
                    <div className="standing-row-shimmer post-row-skeleton-action" />
                    <div className="standing-row-shimmer post-row-skeleton-action" />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
