'use client';

import { useRef, type MouseEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeftIcon, OsIconAction, type ActionDrawerItem } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { ArticleReadProgress } from '@/components/portfolio/article-read-progress';
import { PortfolioWritingArticleCommerce } from '@/components/portfolio/portfolio-writing-article-commerce';
import {
  PortfolioWritingArticleActions,
  PortfolioWritingArticlePanel,
  type PortfolioWritingArticlePanelProps,
} from '@/components/portfolio/portfolio-writing-article-panel';
import { useRegisterImmersiveChromeQuiet } from '@/contexts/dock-chrome-context';
import { useWriteDockPinned } from '@/contexts/compose-launcher-context';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';
import { useArticleReadChrome } from '@/hooks/use-article-read-chrome';
import { useEssayReturnSearch } from '@/hooks/use-essay-return-search';
import { parseArticleSnapshot } from '@/lib/article-post-payload';
import { withEssayReturnSearch } from '@/lib/essay-return-href';
import { writingPath } from '@/lib/overlay-routes';
import { consumeWritingShelf } from '@/lib/writing-shelf-return';

const ARTICLE_READ_CLASS = 'article-read-screen feed-article-slide';

export type ArticleReadFooterProps = {
  /** Feed owns buy sheets. Omit to resolve listed Drop on the reader. */
  commerce?: ReactNode;
  onReply?: () => void;
  shareExtras?: ActionDrawerItem[];
  /** Feed post controls. Omit for the Writing like / save / reply / share row. */
  footer?: ReactNode;
};

function ArticleReadBody(
  panel: PortfolioWritingArticlePanelProps & { progress: number }
) {
  return (
    <>
      <ArticleReadProgress progress={panel.progress} />
      <div className="feed-article-read">
        <PortfolioWritingArticlePanel
          accountId={panel.accountId}
          titleLabel={panel.titleLabel}
          avatarUrl={panel.avatarUrl}
          post={panel.post}
          coverHint={panel.coverHint}
          showActions={false}
          showAuthor
          onReturnToShelf={panel.onReturnToShelf}
        />
      </div>
    </>
  );
}

function ArticleReadFooter({
  post,
  commerce,
  onReply,
  shareExtras,
}: ArticleReadFooterProps & {
  post: PortfolioWritingArticlePanelProps['post'];
}) {
  return (
    <div className="scarce-post-medium-chrome">
      {commerce !== undefined ? (
        commerce
      ) : (
        <PortfolioWritingArticleCommerce post={post} />
      )}
      <PortfolioWritingArticleActions
        post={post}
        onReply={onReply}
        shareExtras={shareExtras}
      />
    </div>
  );
}

/** Overlay reader — feed and Writing list. Circle-back dismisses. */
export function ArticleReadOverlay({
  open,
  onOpenChange,
  commerce,
  onReply,
  shareExtras,
  footer,
  ...panel
}: PortfolioWritingArticlePanelProps &
  ArticleReadFooterProps & {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) {
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const articleTitle =
    parseArticleSnapshot(panel.post.value)?.title?.trim() || 'Article';
  const writePinned = useWriteDockPinned();
  const { chromeQuiet, progress, wakeFooter } = useArticleReadChrome(
    scrollRootRef,
    open,
    writePinned
  );
  const quiet = chromeQuiet && !writePinned;
  const resolvedFooter =
    footer !== undefined ? (
      footer
    ) : (
      <ArticleReadFooter
        post={panel.post}
        commerce={commerce}
        onReply={onReply}
        shareExtras={shareExtras}
      />
    );
  const showWakeFooter = Boolean(resolvedFooter) && wakeFooter && !writePinned;

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
      className={`${ARTICLE_READ_CLASS}${quiet ? ' is-chrome-quiet' : ''}${
        showWakeFooter ? ' is-wake-footer' : ''
      }`}
      contentClassName="feed-article-slide-body"
      footer={resolvedFooter}
    >
      <ArticleReadBody {...panel} progress={progress} />
    </OsSlideOverScreen>
  );
}

/** Permalink `/writing/{id}` — same document as the overlay. */
export function ArticleReadPage(panel: PortfolioWritingArticlePanelProps) {
  const router = useRouter();
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const articleTitle =
    parseArticleSnapshot(panel.post.value)?.title?.trim() || 'Writing';
  const { chromeQuiet, progress, wakeFooter } = useArticleReadChrome(
    scrollRootRef,
    true
  );
  const returnSearch = useEssayReturnSearch();
  const shelfHref = withEssayReturnSearch(
    writingPath(panel.accountId),
    returnSearch
  );
  useRegisterImmersiveChromeQuiet(true);

  const onShelfBack = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!consumeWritingShelf(panel.accountId)) return;
    event.preventDefault();
    router.back();
  };

  return (
    <OsAppScreen
      title={articleTitle}
      heading={<></>}
      immersiveHeader
      scrollRootRef={scrollRootRef}
      compactChrome
      className={`${ARTICLE_READ_CLASS} portfolio-writing-article-screen${
        chromeQuiet ? ' is-chrome-quiet' : ''
      }${wakeFooter ? ' is-wake-footer' : ''}`}
      leading={
        <OsIconAction asChild ariaLabel="Back">
          <Link
            href={shelfHref}
            scroll={false}
            prefetch={false}
            onClick={onShelfBack}
          >
            <ChevronLeftIcon className="glass-sheet-close-icon" aria-hidden />
          </Link>
        </OsIconAction>
      }
      footer={<ArticleReadFooter post={panel.post} />}
    >
      <ArticleReadBody {...panel} progress={progress} />
    </OsAppScreen>
  );
}
