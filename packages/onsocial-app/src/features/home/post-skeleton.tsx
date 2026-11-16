'use client';

import { Divider } from '@onsocial/ui';
import { QuotedPostInsetPending } from '@/features/home/post-card-quote';
import { GUILDS_PAGE_CLASS } from '@/lib/os-chrome-page';

export type PostSkeletonFrame =
  | 'text'
  | 'single'
  | 'collage-2'
  | 'collage-3'
  | 'collage-4'
  | 'quote'
  | 'poll';

/** Home cold load — one frame per row, same boxes the live cards reserve. */
export const HOME_FEED_COLD_SKELETON_FRAMES = [
  'single',
  'quote',
  'poll',
  'collage-2',
] as const satisfies readonly PostSkeletonFrame[];

/** Next page — same reserved media boxes, shorter list. */
export const HOME_FEED_APPEND_SKELETON_FRAMES = [
  'single',
  'collage-2',
] as const satisfies readonly PostSkeletonFrame[];

function PostSkeletonMedia({ frame }: { frame: PostSkeletonFrame }) {
  if (frame === 'text') return null;
  if (frame === 'quote') {
    return <QuotedPostInsetPending />;
  }
  if (frame === 'poll') {
    return (
      <div className="post-poll-embed post-row-skeleton-poll" aria-hidden>
        <div className="standing-row-shimmer post-row-skeleton-line" />
        <ul className="post-poll-options">
          {Array.from({ length: 3 }, (_, index) => (
            <li key={index}>
              <div className="standing-row-shimmer post-row-skeleton-poll-option" />
            </li>
          ))}
        </ul>
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

/**
 * Opened post — focal block, replies label, then reply rows.
 * Sheets keep the reply fade; quotes full page uses PostQuotesPageSkeleton.
 */
export function PostThreadPageSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className={GUILDS_PAGE_CLASS} aria-hidden>
      <div className="post-row-skeleton-list">
        <div className="post-card post-card--skeleton post-card--detail">
          <div className="post-card-avatar post-row-skeleton-avatar standing-row-shimmer" />
          <div className="post-card-copy">
            <div className="standing-row-shimmer post-row-skeleton-line" />
            <div className="standing-row-shimmer post-row-skeleton-line-body" />
            <div className="post-card-detail-time">
              <div className="standing-row-shimmer post-row-skeleton-line-sm" />
            </div>
            <div className="post-card-engagement">
              <div className="post-card-engagement-actions">
                {Array.from({ length: 4 }, (_, index) => (
                  <span
                    key={index}
                    className="standing-row-shimmer post-row-skeleton-action"
                  />
                ))}
              </div>
              <div className="post-card-engagement-trailing">
                <span className="standing-row-shimmer post-row-skeleton-action" />
                <span className="standing-row-shimmer post-row-skeleton-action" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <Divider variant="detail" />
      <div className="thread-controls-row">
        <span className="standing-row-shimmer post-row-skeleton-line-sm" />
      </div>
      <PostRowSkeleton rows={rows} />
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
                {/* Engagement bones always — live cards mount EMPTY_POST_ENGAGEMENT. */}
                <div className="post-card-engagement">
                  <div className="post-card-engagement-actions">
                    {Array.from({ length: 4 }, (_, action) => (
                      <span
                        key={action}
                        className="standing-row-shimmer post-row-skeleton-action"
                      />
                    ))}
                  </div>
                  <div className="post-card-engagement-trailing">
                    <span className="standing-row-shimmer post-row-skeleton-action" />
                    <span className="standing-row-shimmer post-row-skeleton-action" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
