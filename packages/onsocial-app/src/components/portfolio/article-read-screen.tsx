'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeftIcon,
  OsIconAction,
  type ActionDrawerItem,
} from '@onsocial/ui';
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
import { popArticleTrail, pushArticleTrail } from '@/lib/article-read-trail';
import { parseArticleSnapshot } from '@/lib/article-post-payload';
import { withEssayReturnSearch } from '@/lib/essay-return-href';
import { writingPath } from '@/lib/overlay-routes';
import { postKey } from '@/lib/post-display';
import { consumeWritingShelf } from '@/lib/writing-shelf-return';
import type { PostRow } from '@onsocial/sdk';
import type { WritingArticleCoverHint } from '@/lib/hydrate-writing-article-covers';

const ARTICLE_READ_CLASS = 'article-read-screen feed-article-slide';

/**
 * Articles opened from More by stay in this reader. Back walks the trail.
 * Opening the reader again starts at the piece that was tapped.
 */
function useArticleReadTrail(root: PostRow, open: boolean) {
  const rootKey = postKey(root);
  const [trail, setTrail] = useState<PostRow[]>([root]);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTrail([root]);
  } else if (open && postKey(trail[0] ?? root) !== rootKey) {
    setTrail([root]);
  }
  const trailRef = useRef(trail);
  useEffect(() => {
    trailRef.current = trail;
  }, [trail]);
  const current = trail[trail.length - 1] ?? root;
  const openArticle = useCallback((post: PostRow) => {
    setTrail((prev) => pushArticleTrail(prev, post));
  }, []);
  const backArticle = useCallback(() => {
    if (!popArticleTrail(trailRef.current)) return false;
    setTrail((prev) => popArticleTrail(prev) ?? prev);
    return true;
  }, []);
  return { current, openArticle, backArticle };
}

function hintForArticle(
  post: PostRow,
  root: PostRow,
  rootHint: WritingArticleCoverHint | null | undefined,
  hints: Record<string, WritingArticleCoverHint> | undefined
): WritingArticleCoverHint | null {
  return (
    hints?.[postKey(post)] ??
    (postKey(post) === postKey(root) ? (rootHint ?? null) : null)
  );
}

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
          articles={panel.articles}
          coverHints={panel.coverHints}
          onOpenArticle={panel.onOpenArticle}
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
  const { current, openArticle, backArticle } = useArticleReadTrail(
    panel.post,
    open
  );
  const articleTitle =
    parseArticleSnapshot(current.value)?.title?.trim() || 'Article';
  const writePinned = useWriteDockPinned();
  const { chromeQuiet, progress, wakeFooter } = useArticleReadChrome(
    scrollRootRef,
    open,
    writePinned
  );
  const quiet = chromeQuiet && !writePinned;
  const readingRoot = postKey(current) === postKey(panel.post);
  const resolvedFooter = readingRoot ? (
    footer !== undefined ? (
      footer
    ) : (
      <ArticleReadFooter
        post={current}
        commerce={commerce}
        onReply={onReply}
        shareExtras={shareExtras}
      />
    )
  ) : (
    <ArticleReadFooter post={current} />
  );
  const showWakeFooter = Boolean(resolvedFooter) && wakeFooter && !writePinned;
  const currentKey = postKey(current);
  useEffect(() => {
    scrollRootRef.current?.scrollTo({ top: 0 });
  }, [currentKey]);

  return (
    <OsSlideOverScreen
      open={open}
      onClose={() => onOpenChange(false)}
      onBeforeClose={() => !backArticle()}
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
      <ArticleReadBody
        {...panel}
        post={current}
        coverHint={hintForArticle(
          current,
          panel.post,
          panel.coverHint,
          panel.coverHints
        )}
        onOpenArticle={openArticle}
        progress={progress}
      />
    </OsSlideOverScreen>
  );
}

/** Permalink `/writing/{id}` — same document as the overlay. */
export function ArticleReadPage(panel: PortfolioWritingArticlePanelProps) {
  const router = useRouter();
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const { current, openArticle, backArticle } = useArticleReadTrail(
    panel.post,
    true
  );
  const articleTitle =
    parseArticleSnapshot(current.value)?.title?.trim() || 'Writing';
  const { chromeQuiet, progress, wakeFooter } = useArticleReadChrome(
    scrollRootRef,
    true
  );
  const currentKey = postKey(current);
  useEffect(() => {
    scrollRootRef.current?.scrollTo({ top: 0 });
  }, [currentKey]);
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
            onClick={(event) => {
              if (backArticle()) {
                event.preventDefault();
                return;
              }
              onShelfBack(event);
            }}
          >
            <ChevronLeftIcon className="glass-sheet-close-icon" aria-hidden />
          </Link>
        </OsIconAction>
      }
      footer={<ArticleReadFooter post={current} />}
    >
      <ArticleReadBody
        {...panel}
        post={current}
        coverHint={hintForArticle(
          current,
          panel.post,
          panel.coverHint,
          panel.coverHints
        )}
        onOpenArticle={openArticle}
        progress={progress}
      />
    </OsAppScreen>
  );
}
