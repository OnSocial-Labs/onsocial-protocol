'use client';

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { canonicalizeMoodKey, MOODS } from '@onsocial/text-card';
import type { PostRow } from '@onsocial/sdk';
import { OsMediaFaceShell } from '@/components/os/os-media-face-shell';
import { PortfolioWritingArticlePanel } from '@/components/portfolio/portfolio-writing-article-panel';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import { parseArticleSnapshot } from '@/lib/article-post-payload';
import { portfolioPath } from '@/lib/overlay-routes';
import { displayName } from '@/lib/profile-display';

/**
 * Feed article reader — same media-face slide-over as photo enlarge.
 * Close returns to the feed post; no route change.
 */
export function FeedArticleReadScreen({
  open,
  onOpenChange,
  post,
  authorProfile,
  cardBg = null,
  engagement = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: PostRow;
  authorProfile?: PostAuthorProfile;
  /** Text-card mood — solid face background when present. */
  cardBg?: string | null;
  engagement?: ReactNode;
}) {
  const article = parseArticleSnapshot(post.value);
  const articleTitle = article?.title?.trim() || 'Article';
  const authorName = displayName(post.accountId, authorProfile?.displayName);
  const authorHref = portfolioPath(post.accountId);
  const moodStyle = useMemo((): CSSProperties | undefined => {
    const key = canonicalizeMoodKey(cardBg?.trim() ?? '');
    if (!key) return undefined;
    const mood = MOODS[key];
    return {
      background: mood.bgFrom,
      color: mood.textPrimary,
      ['--feed-article-muted' as string]: mood.textMuted,
    };
  }, [cardBg]);

  return (
    <OsMediaFaceShell
      open={open}
      onClose={() => onOpenChange(false)}
      title={articleTitle}
      quietTitle
      closeAriaLabel="Back from article"
      zIndex={SCARCE_Z.listenShell}
      footer={engagement}
      stageLayout="scroll"
      className="feed-article-slide"
      contentClassName="feed-article-slide-body"
      bodyClassName="feed-article-read"
      bodyStyle={moodStyle}
      mast={
        <Link
          href={authorHref}
          className="os-media-face-identity"
          scroll={false}
          aria-label={`View ${authorName}'s profile`}
        >
          <AccountAvatar
            accountId={post.accountId}
            src={authorProfile?.avatarUrl}
            fallbackInitial={authorName}
            size="md"
          />
          <span className="os-media-face-identity-name">{authorName}</span>
        </Link>
      }
    >
      <PortfolioWritingArticlePanel
        accountId={post.accountId}
        titleLabel={authorName}
        avatarUrl={authorProfile?.avatarUrl}
        post={post}
        showActions={false}
        showAuthor={false}
      />
    </OsMediaFaceShell>
  );
}
