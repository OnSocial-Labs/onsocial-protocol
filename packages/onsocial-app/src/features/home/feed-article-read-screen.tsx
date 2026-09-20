'use client';

import { useRef, type ReactNode } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { ChevronLeftIcon } from '@onsocial/ui';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { ArticleReadProgress } from '@/components/portfolio/article-read-progress';
import { PortfolioWritingArticlePanel } from '@/components/portfolio/portfolio-writing-article-panel';
import { useWriteDockPinned } from '@/contexts/compose-launcher-context';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';
import { useArticleReadChrome } from '@/hooks/use-article-read-chrome';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import { parseArticleSnapshot } from '@/lib/article-post-payload';
import { displayName } from '@/lib/profile-display';

/**
 * Feed article reader — same document as profile Writing.
 * Quiet chrome: circle back at rest, fold on scroll, 2px progress, no dock.
 * Reply briefly keeps the write dock. Card paper stays on the cover print.
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
  /** Listed article — Mint / Buy stays on the document, not a second reader. */
  commerce?: ReactNode;
}) {
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const article = parseArticleSnapshot(post.value);
  const articleTitle = article?.title?.trim() || 'Article';
  const authorName = displayName(post.accountId, authorProfile?.displayName);
  const writePinned = useWriteDockPinned();
  const { chromeQuiet, progress, wakeFooter } = useArticleReadChrome(
    scrollRootRef,
    open,
    writePinned
  );

  const hasSocial = Boolean(commerce || engagement);
  const showWakeFooter = hasSocial && wakeFooter && !writePinned;
  const quiet = chromeQuiet && !writePinned;

  return (
    <OsSlideOverScreen
      open={open}
      onClose={() => onOpenChange(false)}
      title={articleTitle}
      heading={<></>}
      immersiveHeader
      closeAriaLabel="Back from article"
      closeIcon={<ChevronLeftIcon className="glass-sheet-close-icon" />}
      zIndex={SCARCE_Z.listenShell}
      keepDock={writePinned}
      scrollRootRef={scrollRootRef}
      className={`feed-article-slide${quiet ? ' is-chrome-quiet' : ''}${
        showWakeFooter ? ' is-wake-footer' : ''
      }`}
      contentClassName="feed-article-slide-body"
      footer={
        hasSocial ? (
          <div className="scarce-post-medium-chrome">
            {commerce}
            {engagement}
          </div>
        ) : null
      }
    >
      <ArticleReadProgress progress={progress} />
      <div className="feed-article-read">
        <PortfolioWritingArticlePanel
          accountId={post.accountId}
          titleLabel={authorName}
          avatarUrl={authorProfile?.avatarUrl}
          post={post}
          showActions={false}
          showAuthor
        />
      </div>
    </OsSlideOverScreen>
  );
}
