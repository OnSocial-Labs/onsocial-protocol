'use client';

import type { ReactNode } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { ArticleReadOverlay } from '@/components/portfolio/article-read-screen';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import { displayName } from '@/lib/profile-display';

/**
 * Feed article — same overlay reader as Writing list.
 * Footer is the feed post row (reply / quote / amplify / like / save / share).
 */
export function FeedArticleReadScreen({
  open,
  onOpenChange,
  post,
  authorProfile,
  engagement = null,
  commerce = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: PostRow;
  authorProfile?: PostAuthorProfile;
  engagement?: ReactNode;
  commerce?: ReactNode;
}) {
  const authorName = displayName(post.accountId, authorProfile?.displayName);
  const hasSocial = Boolean(commerce || engagement);

  return (
    <ArticleReadOverlay
      open={open}
      onOpenChange={onOpenChange}
      accountId={post.accountId}
      titleLabel={authorName}
      avatarUrl={authorProfile?.avatarUrl}
      post={post}
      footer={
        hasSocial ? (
          <div className="scarce-post-medium-chrome">
            {commerce}
            {engagement}
          </div>
        ) : null
      }
    />
  );
}
