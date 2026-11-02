'use client';

import { AccountAvatar } from '@/components/profile/account-avatar';
import { HomeFeedCatchUpPortal } from '@/features/home/home-feed-catch-up-portal';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import {
  HOME_FEED_NEW_AVATAR_SLOTS,
  homeFeedNewPostsCountLabel,
  homeFeedNewPostsLabel,
  type UnseenFeedSummary,
} from '@/lib/home-feed-new-posts';
import { fallbackLabel } from '@/lib/profile-display';
import { ChevronUpIcon, osDockPillClassName } from '@onsocial/ui';

/**
 * Catch-up chip under home header — ↑ + faces + count posted.
 * Same `.os-dock-pill` material as the home launcher (fill + ::before frost).
 */
export function HomeFeedNewPostsChip({
  summary,
  onClick,
}: {
  summary: UnseenFeedSummary;
  onClick: () => void;
}) {
  const countLabel = homeFeedNewPostsCountLabel(summary.count);
  const ariaLabel = homeFeedNewPostsLabel(summary.count);
  const faces = summary.authorIds.slice(0, HOME_FEED_NEW_AVATAR_SLOTS);
  const profiles = usePostAuthorProfiles(faces);

  if (!countLabel) return null;

  return (
    <HomeFeedCatchUpPortal>
      <div className="home-feed-new-posts-anchor" role="status">
        <button
          type="button"
          className={`${osDockPillClassName} home-feed-new-posts-pill`}
          aria-label={ariaLabel}
          onClick={onClick}
        >
          <ChevronUpIcon
            className="home-feed-new-posts-chevron"
            aria-hidden
          />
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
          <span className="home-feed-new-posts-copy" aria-hidden>
            <span className="home-feed-new-posts-count">{countLabel}</span>
            <span className="home-feed-new-posts-word">posted</span>
          </span>
        </button>
      </div>
    </HomeFeedCatchUpPortal>
  );
}
