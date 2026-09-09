'use client';

import { AccountAvatar } from '@/components/profile/account-avatar';
import { useViewerDockMood } from '@/hooks/use-viewer-dock-mood';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import {
  HOME_FEED_NEW_AVATAR_SLOTS,
  homeFeedNewPostsCountLabel,
  homeFeedNewPostsLabel,
} from '@/lib/home-feed-new-posts';
import { fallbackLabel } from '@/lib/profile-display';

/**
 * Top catch-up chip — dock frost + mood, ≤3 faces, compact count.
 * Parent owns scroll-hide (same tuck as home chrome).
 */
export function HomeFeedNewPostsChip({
  count,
  authorIds,
  hidden = false,
  onClick,
}: {
  count: number;
  authorIds: string[];
  hidden?: boolean;
  onClick: () => void;
}) {
  const countLabel = homeFeedNewPostsCountLabel(count);
  const ariaLabel = homeFeedNewPostsLabel(count);
  const faces = authorIds.slice(0, HOME_FEED_NEW_AVATAR_SLOTS);
  const profiles = usePostAuthorProfiles(faces);
  const { moodId, style: moodStyle } = useViewerDockMood();

  if (!countLabel) return null;

  return (
    <div
      className={`home-feed-new-posts-anchor${hidden ? ' is-scroll-hidden' : ''}`}
      role="status"
    >
      <button
        type="button"
        className="home-feed-new-posts-pill"
        data-mood={moodId ?? undefined}
        style={moodStyle}
        aria-label={ariaLabel}
        onClick={onClick}
      >
        {faces.length > 0 ? (
          <span className="home-feed-new-posts-faces" aria-hidden>
            {faces.map((accountId) => {
              const profile = profiles[accountId];
              const name =
                profile?.displayName?.trim() || fallbackLabel(accountId);
              return (
                <AccountAvatar
                  key={accountId}
                  accountId={accountId}
                  src={profile?.avatarUrl}
                  size="sm"
                  fallbackInitial={name.slice(0, 1)}
                  className="home-feed-new-posts-face"
                />
              );
            })}
          </span>
        ) : null}
        <span className="home-feed-new-posts-count">{countLabel}</span>
      </button>
    </div>
  );
}
