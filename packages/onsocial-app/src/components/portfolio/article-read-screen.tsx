'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
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
import { onCloseMediaFaces } from '@/lib/media-face-session';
import { ArticleReadProgress } from '@/components/portfolio/article-read-progress';
import { PortfolioWritingArticleCommerce } from '@/components/portfolio/portfolio-writing-article-commerce';
import {
  PortfolioWritingArticleActions,
  PortfolioWritingArticlePanel,
  type PortfolioWritingArticlePanelProps,
} from '@/components/portfolio/portfolio-writing-article-panel';
import { useRegisterImmersiveChromeQuiet } from '@/contexts/dock-chrome-context';
import { useWriteDockPinned } from '@/contexts/compose-launcher-context';
import { useOsDropSheetOpen } from '@/hooks/use-os-drop-sheet-open';
import {
  isWritingArticleHref,
  isWritingShelfIndexHref,
} from '@/components/portfolio/account-place-link';
import { PostCardMenu } from '@/features/home/post-card-menu';
import { parseInAppDropLayerHref } from '@/lib/app-routes';
import { usePostLayerOwnerZ } from '@/features/home/post-layer-owner-z';
import { postThreadPath } from '@/lib/post-routes';
import { postLayerOverlayZ } from '@/lib/sheet-z';
import { useArticleReadChrome } from '@/hooks/use-article-read-chrome';
import { useEssayReturnSearch } from '@/hooks/use-essay-return-search';
import {
  applyArticleScroll,
  articleScrollMemory,
  commitArticleScroll,
  saveArticleScroll,
} from '@/lib/article-read-scroll';
import {
  articlePermalinkBack,
  popArticleTrail,
  pushArticleTrail,
} from '@/lib/article-read-trail';
import { parseArticleSnapshot } from '@/lib/article-post-payload';
import { withEssayReturnSearch } from '@/lib/essay-return-href';
import { writingPath } from '@/lib/overlay-routes';
import { postKey } from '@/lib/post-display';
import { consumeWritingShelf } from '@/lib/writing-shelf-return';
import type { PostRow } from '@onsocial/sdk';
import type { WritingArticleCoverHint } from '@/lib/hydrate-writing-article-covers';

export const ARTICLE_READ_CLASS = 'article-read-screen feed-article-slide';

/** Frosted header disc. Stand and the name stay on the page. */
function ArticleReaderMenu({
  post,
  authorName,
  avatarUrl,
  zIndex,
  onOpenPost,
  onPlaceLeave,
}: {
  post: PostRow;
  authorName: string;
  avatarUrl?: string | null;
  zIndex: number;
  onOpenPost?: () => void;
  onPlaceLeave?: (href: string) => void;
}) {
  const postHref = postThreadPath(post);
  return (
    <PostCardMenu
      href={postHref}
      openPostHref={postHref}
      accountId={post.accountId}
      authorProfile={{
        accountId: post.accountId,
        displayName: authorName,
        avatarUrl: avatarUrl ?? null,
      }}
      besideStand
      onOpenPost={onPlaceLeave ? undefined : onOpenPost}
      onOpenPostHref={onPlaceLeave ? () => onPlaceLeave(postHref) : undefined}
      zIndex={zIndex}
    />
  );
}

function unmodifiedPrimary(event: {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  button: number;
}): boolean {
  return (
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    event.button === 0
  );
}

/** In-app link inside the reader. Drop links keep their own opener. */
function readerLeaveHref(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest('a');
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.target === '_blank') return null;
  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#') || /^https?:/i.test(href)) return null;
  const path = href.split(/[?#]/)[0] ?? href;
  if (!path.startsWith('/')) return null;
  if (parseInAppDropLayerHref(path)) return null;
  return href;
}

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

/**
 * Each essay keeps its own place. A new essay starts at the top.
 * Opening the reader again starts at the top of the piece that was tapped.
 */
function useArticleReadPlace(
  scrollRootRef: RefObject<HTMLElement | null>,
  currentKey: string,
  open: boolean
) {
  const memoryRef = useRef(articleScrollMemory(currentKey));
  const openRef = useRef(false);
  const rememberPlace = useCallback(() => {
    const root = scrollRootRef.current;
    if (!root) return;
    memoryRef.current = saveArticleScroll(memoryRef.current, root.scrollTop);
  }, [scrollRootRef]);
  useLayoutEffect(() => {
    const root = scrollRootRef.current;
    const reopened = open && !openRef.current;
    openRef.current = open;
    if (!open) return;
    if (reopened) {
      memoryRef.current = articleScrollMemory(currentKey);
      if (root) applyArticleScroll(root, 0);
      return;
    }
    const moved = commitArticleScroll(memoryRef.current, currentKey);
    memoryRef.current = moved.memory;
    if (root) applyArticleScroll(root, moved.scrollTop);
  }, [currentKey, open, scrollRootRef]);
  return rememberPlace;
}

function useArticleReader(
  root: PostRow,
  open: boolean,
  scrollRootRef: RefObject<HTMLElement | null>
) {
  const {
    current,
    openArticle: pushArticle,
    backArticle: popArticle,
  } = useArticleReadTrail(root, open);
  const currentKey = postKey(current);
  const rememberPlace = useArticleReadPlace(scrollRootRef, currentKey, open);
  const openArticle = useCallback(
    (post: PostRow) => {
      rememberPlace();
      pushArticle(post);
    },
    [pushArticle, rememberPlace]
  );
  const backArticle = useCallback(() => {
    rememberPlace();
    return popArticle();
  }, [popArticle, rememberPlace]);
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
  /** Feed passes its own row. Omit to open Mint, Buy, and Bid sheets here. */
  commerce?: ReactNode;
  onReply?: () => void;
  shareExtras?: ActionDrawerItem[];
  /** Feed post controls. Omit for the Writing like / save / reply / share row. */
  footer?: ReactNode;
  /** Book / issue pages. Replaces the essay and keeps this overlay's footer. */
  renderBody?: (chrome: { onChromeTap: () => void }) => ReactNode;
  /** Dialog name when the post has no essay title. */
  documentTitle?: string;
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

/** Writing / drop reader footer — commerce + like / save / reply / share. */
export function ArticleReadFooter({
  post,
  commerce,
  onReply,
  shareExtras,
}: ArticleReadFooterProps & {
  post: PortfolioWritingArticlePanelProps['post'];
}) {
  return (
    <div className="scarce-post-medium-chrome article-read-footer">
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
  parked = false,
  onPlaceLeave,
  onOpenChange,
  onClosed,
  commerce,
  onReply,
  shareExtras,
  footer,
  renderBody,
  documentTitle,
  pane = null,
  threadOpen = false,
  onDismissThread,
  ...panel
}: PortfolioWritingArticlePanelProps &
  ArticleReadFooterProps & {
    open: boolean;
    /** Parked under a profile or post opened from this reader. */
    parked?: boolean;
    /** Author, Writing, and Open post. Writing full-loads; the rest park. */
    onPlaceLeave?: (href: string) => void;
    onOpenChange: (open: boolean) => void;
    /** After the exit slide — parents drop the tree (overlay-idle). */
    onClosed?: () => void;
    /** Reply thread pinned over the page. Profile omits this. */
    pane?: ReactNode;
    threadOpen?: boolean;
    onDismissThread?: () => void;
  }) {
  const overlayZ = postLayerOverlayZ(usePostLayerOwnerZ());
  const faceZ = overlayZ.face;
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const { current, openArticle, backArticle } = useArticleReader(
    panel.post,
    open,
    scrollRootRef
  );
  const parentReturnToShelf = panel.onReturnToShelf;
  /** Shelf already under this reader — Writing dismisses onto that list. */
  const onReturnToShelf = useCallback(() => {
    if (parentReturnToShelf) {
      parentReturnToShelf();
      return;
    }
    onOpenChange(false);
  }, [onOpenChange, parentReturnToShelf]);
  const articleTitle =
    parseArticleSnapshot(current.value)?.title?.trim() ||
    documentTitle?.trim() ||
    'Article';
  const writePinned = useWriteDockPinned();
  const dropSheetOpen = useOsDropSheetOpen();
  const writingLeftRef = useRef(false);
  const leaveFromReader = useCallback(
    (href: string) => {
      // Shelf already under this reader — byline Writing just closes.
      if (parentReturnToShelf && isWritingShelfIndexHref(href)) {
        parentReturnToShelf();
        return;
      }
      onPlaceLeave?.(href);
    },
    [onPlaceLeave, parentReturnToShelf]
  );
  const onPointerDownCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (!onPlaceLeave || !unmodifiedPrimary(event)) return;
    const href = readerLeaveHref(event.target);
    // Essay / More-by permalinks flip in place — do not treat as leave.
    if (!href || !isWritingShelfIndexHref(href)) return;
    event.preventDefault();
    event.stopPropagation();
    writingLeftRef.current = true;
    leaveFromReader(href);
  };
  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!onPlaceLeave || !unmodifiedPrimary(event)) return;
    const href = readerLeaveHref(event.target);
    if (!href) return;
    if (isWritingArticleHref(href)) return;
    if (isWritingShelfIndexHref(href) && writingLeftRef.current) {
      event.preventDefault();
      event.stopPropagation();
      writingLeftRef.current = false;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    leaveFromReader(href);
  };
  const { chromeQuiet, progress, wakeFooter, onChromeTap } =
    useArticleReadChrome(scrollRootRef, open, writePinned);
  const quiet = chromeQuiet && !writePinned;
  const leaveArticle = useCallback(() => {
    onDismissThread?.();
    onOpenChange(false);
  }, [onDismissThread, onOpenChange]);
  useEffect(() => {
    if (!open) return;
    return onCloseMediaFaces(leaveArticle);
  }, [leaveArticle, open]);
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

  return (
    <OsSlideOverScreen
      open={open}
      onClose={() => onOpenChange(false)}
      onClosed={onClosed}
      title={articleTitle}
      heading={<></>}
      immersiveHeader
      closeAriaLabel="Back from article"
      closeIcon={<ChevronLeftIcon className="glass-sheet-close-icon" />}
      actions={
        <ArticleReaderMenu
          post={current}
          authorName={
            current.accountId === panel.accountId
              ? panel.titleLabel
              : current.accountId
          }
          avatarUrl={
            current.accountId === panel.accountId ? panel.avatarUrl : null
          }
          zIndex={overlayZ.sheet}
          onOpenPost={() => onOpenChange(false)}
          onPlaceLeave={onPlaceLeave}
        />
      }
      zIndex={faceZ}
      yielded={parked}
      keepDock={parked || writePinned || threadOpen || dropSheetOpen}
      scrollRootRef={scrollRootRef}
      className={`${ARTICLE_READ_CLASS}${quiet ? ' is-chrome-quiet' : ''}${
        showWakeFooter ? ' is-wake-footer' : ''
      }${threadOpen ? ' feed-face-thread' : ''}`}
      contentClassName="feed-article-slide-body"
      footer={resolvedFooter}
      pane={pane}
      onBeforeClose={() => {
        if (threadOpen) {
          onDismissThread?.();
          return false;
        }
        return !backArticle();
      }}
    >
      <div
        style={onPlaceLeave ? { display: 'contents' } : undefined}
        onPointerDownCapture={onPlaceLeave ? onPointerDownCapture : undefined}
        onClickCapture={onPlaceLeave ? onClickCapture : undefined}
      >
        {renderBody ? (
          <>
            <ArticleReadProgress progress={progress} />
            <div className="feed-article-read">
              {renderBody({ onChromeTap })}
            </div>
          </>
        ) : (
          <ArticleReadBody
            {...panel}
            post={current}
            onReturnToShelf={onReturnToShelf}
            coverHint={hintForArticle(
              current,
              panel.post,
              panel.coverHint,
              panel.coverHints
            )}
            onOpenArticle={openArticle}
            progress={progress}
          />
        )}
      </div>
    </OsSlideOverScreen>
  );
}

/** Permalink `/writing/{id}` — same document as the overlay. */
export function ArticleReadPage(panel: PortfolioWritingArticlePanelProps) {
  const router = useRouter();
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const { current, openArticle, backArticle } = useArticleReader(
    panel.post,
    true,
    scrollRootRef
  );
  const articleTitle =
    parseArticleSnapshot(current.value)?.title?.trim() || 'Writing';
  const overlayZ = postLayerOverlayZ(usePostLayerOwnerZ());
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
              const action = articlePermalinkBack({
                poppedTrail: backArticle(),
                historyLength: window.history.length,
              });
              if (action === 'shelf') {
                onShelfBack(event);
                return;
              }
              event.preventDefault();
              if (action === 'history') {
                consumeWritingShelf(panel.accountId);
                router.back();
              }
            }}
          >
            <ChevronLeftIcon className="glass-sheet-close-icon" aria-hidden />
          </Link>
        </OsIconAction>
      }
      actions={
        <ArticleReaderMenu
          post={current}
          authorName={
            current.accountId === panel.accountId
              ? panel.titleLabel
              : current.accountId
          }
          avatarUrl={
            current.accountId === panel.accountId ? panel.avatarUrl : null
          }
          zIndex={overlayZ.sheet}
        />
      }
      footer={<ArticleReadFooter post={current} />}
    >
      <ArticleReadBody
        {...panel}
        post={current}
        // Solid permalink — More expands in this reader (no shelf under it).
        onReturnToShelf={undefined}
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
