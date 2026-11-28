'use client';

import type { ReactNode } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { ArticleReadOverlay } from '@/components/portfolio/article-read-screen';
import { FeedFaceThreadPane } from '@/features/home/feed-media-thread-sheet';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import type { WritingArticleCoverHint } from '@/lib/hydrate-writing-article-covers';
import { displayName } from '@/lib/profile-display';

/**
 * Feed article — same overlay reader as Writing list.
 * Footer is the feed post row (reply / quote / amplify / like / save / share).
 * Writing shelf opens omit engagement so the default article footer paints.
 */
export function FeedArticleReadScreen({
  open,
  parked = false,
  onPlaceLeave,
  onOpenChange,
  onClosed,
  onReturnToShelf,
  post,
  authorProfile,
  engagement = null,
  commerce = null,
  renderBody,
  documentTitle,
  coverHint = null,
  articles,
  coverHints,
  threadOpen = false,
  onDismissThread,
  threadAuthor = null,
  threadPostId = null,
  threadRoot = null,
}: {
  open: boolean;
  /** Parked under a profile or post. Stay mounted and keep the dock. */
  parked?: boolean;
  /** Author, Writing, and Open post leave through the place stack. */
  onPlaceLeave?: (href: string) => void;
  onOpenChange: (open: boolean) => void;
  /** After the exit slide — parents drop the tree (overlay-idle). */
  onClosed?: () => void;
  /** Writing shelf: dismiss onto the list under this reader. */
  onReturnToShelf?: () => void;
  post: PostRow;
  authorProfile?: PostAuthorProfile;
  engagement?: ReactNode;
  commerce?: ReactNode;
  /** Book pages inside this post's reader. Footer stays the post controls. */
  renderBody?: (chrome: { onChromeTap: () => void }) => ReactNode;
  documentTitle?: string;
  coverHint?: WritingArticleCoverHint | null;
  articles?: readonly PostRow[];
  coverHints?: Record<string, WritingArticleCoverHint>;
  /** Reply opens the same thread drawer as a photo. */
  threadOpen?: boolean;
  onDismissThread?: () => void;
  threadAuthor?: string | null;
  threadPostId?: string | null;
  threadRoot?: PostRow | null;
}) {
  const authorName = displayName(post.accountId, authorProfile?.displayName);
  const hasSocial = Boolean(commerce || engagement);
  // Feed without a bridge must keep footer={null}. Shelf passes no footer so
  // ArticleReadOverlay paints the default writing footer.
  const footer = hasSocial ? (
    <div className="scarce-post-medium-chrome">
      {commerce}
      {engagement}
    </div>
  ) : onReturnToShelf ? undefined : null;

  return (
    <ArticleReadOverlay
      open={open}
      parked={parked}
      onPlaceLeave={onPlaceLeave}
      onOpenChange={onOpenChange}
      onClosed={onClosed}
      onReturnToShelf={onReturnToShelf}
      accountId={post.accountId}
      titleLabel={authorName}
      avatarUrl={authorProfile?.avatarUrl}
      post={post}
      documentTitle={documentTitle}
      coverHint={coverHint}
      articles={articles}
      coverHints={coverHints}
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
      {...(footer !== undefined ? { footer } : {})}
    />
  );
}
