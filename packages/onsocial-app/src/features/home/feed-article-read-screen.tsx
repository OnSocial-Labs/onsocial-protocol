'use client';

import type { ReactNode } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { ArticleReadOverlay } from '@/components/portfolio/article-read-screen';
import { FeedFaceThreadPane } from '@/features/home/feed-media-thread-sheet';
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
  renderBody,
  documentTitle,
  threadOpen = false,
  onDismissThread,
  threadAuthor = null,
  threadPostId = null,
  threadRoot = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: PostRow;
  authorProfile?: PostAuthorProfile;
  engagement?: ReactNode;
  commerce?: ReactNode;
  /** Book pages inside this post's reader. Footer stays the post controls. */
  renderBody?: (chrome: { onChromeTap: () => void }) => ReactNode;
  documentTitle?: string;
  /** Reply opens the same thread drawer as a photo. */
  threadOpen?: boolean;
  onDismissThread?: () => void;
  threadAuthor?: string | null;
  threadPostId?: string | null;
  threadRoot?: PostRow | null;
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
      documentTitle={documentTitle}
      renderBody={renderBody}
      threadOpen={threadOpen}
      onDismissThread={onDismissThread}
      pane={
        <FeedFaceThreadPane
          open={threadOpen}
          onDismiss={() => onDismissThread?.()}
          author={threadAuthor}
          postId={threadPostId}
          initialRoot={threadRoot}
        />
      }
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
