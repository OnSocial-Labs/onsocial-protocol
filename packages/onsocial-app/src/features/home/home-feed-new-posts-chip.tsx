'use client';

import { AccountAvatar } from '@/components/profile/account-avatar';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import {
  HOME_FEED_NEW_AVATAR_SLOTS,
  homeFeedNewPostsCountLabel,
  homeFeedNewPostsLabel,
  type UnseenFeedSummary,
} from '@/lib/home-feed-new-posts';
import { fallbackLabel } from '@/lib/profile-display';

/**
 * Catch-up chip under home header — dock frost tokens, ≤3 faces, compact count.
 * Parent owns scroll-hide (same tuck as home chrome). Mounted inside
 * `OsAppScreen` so `--os-dock-*` inherits from the shared dock frost rules.
 */
export function HomeFeedNewPostsChip({
  summary,
  hidden = false,
  onClick,
}: {
  summary: UnseenFeedSummary;
  hidden?: boolean;
  onClick: () => void;
}) {
  const countLabel = homeFeedNewPostsCountLabel(summary.count);
  const ariaLabel = homeFeedNewPostsLabel(summary.count);
  const faces = summary.authorIds.slice(0, HOME_FEED_NEW_AVATAR_SLOTS);
  const profiles = usePostAuthorProfiles(faces);

  if (!countLabel) return null;

  return (
    <div
      className={`home-feed-new-posts-anchor${hidden ? ' is-scroll-hidden' : ''}`}
      role="status"
    >
      <button
        type="button"
        className="home-feed-new-posts-pill"
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
