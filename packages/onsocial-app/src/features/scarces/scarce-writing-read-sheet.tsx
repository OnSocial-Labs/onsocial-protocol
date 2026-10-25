'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  CheckIcon,
  ChevronLeftIcon,
  Divider,
  OsIconAction,
  OsSheetAction,
  OsSheetActions,
  OsSheetFooter,
  ShareIcon,
} from '@onsocial/ui';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { ARTICLE_READ_CLASS } from '@/components/portfolio/article-read-screen';
import { ArticleReadProgress } from '@/components/portfolio/article-read-progress';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useRegisterImmersiveChromeQuiet } from '@/contexts/dock-chrome-context';
import { useWriteDockPinned } from '@/contexts/compose-launcher-context';
import { useArticleReadChrome } from '@/hooks/use-article-read-chrome';
import { CollectionWritingReader } from '@/features/scarces/collection-writing-reader';
import {
  collectionCurrentRowToView,
  hydrateWritingManifest,
} from '@/features/scarces/collections-data';
import { DropArtOverlay } from '@/features/scarces/drop-artwork-preview';
import {
  isWritingPdfMime,
  writingReaderKindLabel,
  type ScarceReadableMedia,
  type WritingReleaseFormat,
} from '@/features/scarces/drop-writing';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';
import { MediaFaceIdentity } from '@/components/profile/media-face-identity';
import { MediaFaceStandButton } from '@/components/ui/media-face-stand-button';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { formatWritingReadLabel } from '@/lib/article-post-payload';
import { accountIdsEqual } from '@/lib/account-match';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { bookReaderSharePath } from '@/lib/portfolio-holdings';
import { displayName } from '@/lib/profile-display';
import { shareUrl } from '@/lib/share-url';
import {
  formatWritingShelfTimestamp,
  postTimestampIso,
} from '@/lib/post-display';

function visibleWorkTitle(value: string): string {
  const next = value.trim();
  return next && next.toLowerCase() !== 'drop' ? next : '';
}

function inlineSvgMarkup(svg: string): string {
  return svg.replace(/^<\?xml[^>]*>\s*/i, '');
}

/** Book / issue pages inside the article room. The caller owns the screen and footer. */
export function WritingReadDocument({
  open = true,
  title,
  cover = null,
  coverSvg = null,
  collectionId,
  accountId = null,
  creatorId = null,
  readables,
  bookPdf = null,
  writingFormat = null,
  textAlign = null,
  publishedAt = null,
  canRead,
  lockedHint,
  hydrateSettled = true,
  onChromeTap,
}: {
  open?: boolean;
  title: string;
  cover?: string | null;
  coverSvg?: string | null;
  collectionId: string;
  accountId?: string | null;
  creatorId?: string | null;
  readables: ScarceReadableMedia[];
  bookPdf?: ScarceReadableMedia | null;
  writingFormat?: WritingReleaseFormat | null;
  textAlign?: 'left' | 'center' | 'justify' | null;
  publishedAt?: number | null;
  canRead: boolean;
  lockedHint: string;
  hydrateSettled?: boolean;
  onChromeTap?: () => void;
}) {
  const { accountId: viewerAccountId } = useAppWallet();
  const [wasOpen, setWasOpen] = useState(open);
  const [coverOpen, setCoverOpen] = useState(false);
  const [fetchedPublishedAt, setFetchedPublishedAt] = useState<number | null>(
    null
  );
  const [fetchedReadLabel, setFetchedReadLabel] = useState<string | null>(null);
  const authorId = creatorId?.trim() || '';
  const authorProfiles = usePostAuthorProfiles(authorId ? [authorId] : []);
  const authorProfile = authorId ? authorProfiles[authorId] : undefined;
  const authorName = authorId
    ? displayName(authorId, authorProfile?.displayName)
    : '';

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCoverOpen(false);
      setFetchedReadLabel(null);
      setFetchedPublishedAt(null);
    }
  }

  const issuedAt =
    (publishedAt && publishedAt > 0 ? publishedAt : null) ?? fetchedPublishedAt;

  useEffect(() => {
    if (!open || issuedAt) return;
    const id = collectionId.trim();
    if (!id) return;
    let cancelled = false;
    void (async () => {
      const rows = await createReadOnlyOnSocialClient()
        .query.scarces.collectionsCurrentByIds([id])
        .catch(() => []);
      if (cancelled) return;
      const view = rows[0] ? collectionCurrentRowToView(rows[0]) : null;
      if (view && view.createdAtMs > 0) setFetchedPublishedAt(view.createdAtMs);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, issuedAt, collectionId]);

  const inlineChapterText = useMemo(
    () =>
      readables.map((chapter) => chapter.text?.trim() || '').filter(Boolean),
    [readables]
  );
  const pendingChapters = useMemo(
    () =>
      readables.filter(
        (chapter) =>
          !chapter.text?.trim() &&
          Boolean(chapter.url) &&
          !isWritingPdfMime(chapter.mime, chapter.title)
      ),
    [readables]
  );
  const inlineReadLabel =
    open && canRead && pendingChapters.length === 0
      ? formatWritingReadLabel(inlineChapterText.join('\n\n'))
      : null;

  useEffect(() => {
    if (!open || !canRead || pendingChapters.length === 0) return;
    let cancelled = false;
    void (async () => {
      const chunks = [...inlineChapterText];
      for (const chapter of pendingChapters) {
        if (cancelled) return;
        if (!chapter.url) continue;
        try {
          const response = await fetch(chapter.url);
          if (!response.ok) continue;
          chunks.push(await response.text());
        } catch {
          /* a missing chapter does not invent a time */
        }
      }
      if (!cancelled) {
        setFetchedReadLabel(formatWritingReadLabel(chunks.join('\n\n')));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, canRead, pendingChapters, inlineChapterText]);

  const readLabel = inlineReadLabel ?? fetchedReadLabel;

  const workTitle =
    visibleWorkTitle(title) || readables[0]?.title?.trim() || '';
  const dialogName = workTitle || authorName || 'Writing';
  const inlineSvg = coverSvg?.trim() ? inlineSvgMarkup(coverSvg.trim()) : null;
  const rasterCover = cover?.trim() || null;
  const canZoomCover = Boolean(rasterCover || inlineSvg);
  const kindLabel = writingReaderKindLabel({
    writingFormat,
    chapterCount: readables.length,
  });
  const dateline = issuedAt ? formatWritingShelfTimestamp(issuedAt) : null;
  const datelineIso = issuedAt ? postTimestampIso(issuedAt) : undefined;
  const hasWriting = readables.length > 0 || bookPdf != null;
  const onOpenCover = useCallback(() => setCoverOpen(true), []);
  const showAuthorStand = Boolean(
    authorId && !(viewerAccountId && accountIdsEqual(viewerAccountId, authorId))
  );

  return (
    <>
      <article className="portfolio-writing portfolio-writing-article">
        <div className="portfolio-writing-article-spread">
          {canZoomCover ? (
            <button
              type="button"
              className="portfolio-writing-article-cover is-photo"
              aria-label="View cover"
              onClick={onOpenCover}
            >
              {rasterCover ? (
                <img
                  src={rasterCover}
                  alt=""
                  className="portfolio-writing-cover-photo"
                />
              ) : (
                <span
                  className="portfolio-writing-cover-card"
                  dangerouslySetInnerHTML={{ __html: inlineSvg ?? '' }}
                />
              )}
            </button>
          ) : (
            <div
              className="portfolio-writing-article-cover is-card"
              aria-hidden
            />
          )}
          <header className="portfolio-writing-masthead">
            <h1 className="portfolio-writing-article-title">{dialogName}</h1>
            <Divider
              variant="detail"
              className="portfolio-writing-article-rule"
            />
            <div className="portfolio-writing-article-meta">
              {dateline && datelineIso ? (
                <time
                  className="portfolio-writing-dateline"
                  dateTime={datelineIso}
                >
                  {dateline}
                </time>
              ) : null}
              <p className="portfolio-writing-byline">
                <span>{kindLabel}</span>
                {readLabel ? (
                  <>
                    <span className="portfolio-writing-byline-sep" aria-hidden>
                      ·
                    </span>
                    <span>{readLabel}</span>
                  </>
                ) : null}
              </p>
            </div>
          </header>
        </div>
        {authorId ? (
          <div className="portfolio-writing-article-author">
            <MediaFaceIdentity
              accountId={authorId}
              profileName={authorName}
              avatarUrl={authorProfile?.avatarUrl ?? null}
            />
            {showAuthorStand ? (
              <MediaFaceStandButton
                accountId={authorId}
                name={authorName}
                avatarUrl={authorProfile?.avatarUrl ?? null}
                className="portfolio-writing-article-stand"
              />
            ) : null}
          </div>
        ) : null}
        {hasWriting ? (
          <CollectionWritingReader
            collectionId={collectionId}
            accountId={accountId}
            readables={readables}
            bookPdf={bookPdf}
            writingFormat={writingFormat}
            textAlign={textAlign}
            canRead={canRead}
            lockedHint={lockedHint}
            immersive
            gestures={false}
            onChromeTap={onChromeTap}
            workTitle={null}
          />
        ) : (
          <p className="scarce-feed-medium-empty">
            {!hydrateSettled
              ? 'Loading writing…'
              : 'Writing unavailable for this Drop.'}
          </p>
        )}
      </article>
      {(rasterCover || inlineSvg) && coverOpen ? (
        <DropArtOverlay
          open={coverOpen}
          src={rasterCover ?? undefined}
          svg={inlineSvg && !rasterCover ? inlineSvg : null}
          label={dialogName}
          onClose={() => setCoverOpen(false)}
        />
      ) : null}
    </>
  );
}

function absoluteBookUrl(path: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return new URL(path, window.location.origin).toString();
  } catch {
    return '';
  }
}

/** Header share. Sends this book's page, including `t` when a copy is known. */
function BookReaderShareAction({
  open,
  title,
  path,
}: {
  open: boolean;
  title: string;
  path: string;
}) {
  const { setTxResult } = useAppTransactionFeedback();
  const [copied, setCopied] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setCopied(false);
  }
  const name = title.trim() || 'this book';

  return (
    <OsIconAction
      ariaLabel={copied ? 'Link copied' : 'Share this book'}
      title={copied ? 'Link copied' : 'Share'}
      onClick={() => {
        const url = absoluteBookUrl(path);
        if (!url) return;
        void (async () => {
          const result = await shareUrl({
            url,
            title: title.trim() || 'Book',
            text: `Read “${name}” on OnSocial`,
          });
          if (result === 'copied') {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
            return;
          }
          if (result === 'failed') {
            setTxResult({
              type: 'error',
              msg: 'Couldn’t share this book.',
            });
          }
        })();
      }}
    >
      {copied ? <CheckIcon aria-hidden /> : <ShareIcon aria-hidden />}
    </OsIconAction>
  );
}

/**
 * Writing reader — OS phone-card page scroll (body scroller, not a nested
 * text viewport). Jacket sticks at the top; post icons use the OS screen
 * footer so they sit above the summon dock and lift with reply/compose.
 * Scroll-down only tucks the jacket + dock.
 */
export function WritingReadSheet({
  open,
  onClose,
  title,
  cover = null,
  coverSvg = null,
  collectionId,
  tokenId = null,
  accountId = null,
  creatorId = null,
  readables: readablesProp,
  bookPdf: bookPdfProp = null,
  writingFormat: writingFormatProp = null,
  textAlign: textAlignProp = null,
  publishedAt = null,
  canRead,
  lockedHint,
  footer = null,
  threadOpen = false,
  onDismissThread,
  pane = null,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  cover?: string | null;
  coverSvg?: string | null;
  collectionId: string;
  /** When set, the share link names this copy (`?t=`). */
  tokenId?: string | null;
  accountId?: string | null;
  creatorId?: string | null;
  readables: ScarceReadableMedia[];
  bookPdf?: ScarceReadableMedia | null;
  writingFormat?: WritingReleaseFormat | null;
  textAlign?: 'left' | 'center' | 'justify' | null;
  /** Drop created time. Drives the date above Book / Issue. */
  publishedAt?: number | null;
  canRead: boolean;
  lockedHint: string;
  footer?: ReactNode;
  /** Feed reply drawer. A Drop or profile reader leaves these unset. */
  threadOpen?: boolean;
  onDismissThread?: () => void;
  pane?: ReactNode;
}) {
  const { isConnected, connect, isLoading } = useAppWallet();
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  const [hydratedReadables, setHydratedReadables] = useState<
    ScarceReadableMedia[]
  >([]);
  const [hydratedBookPdf, setHydratedBookPdf] =
    useState<ScarceReadableMedia | null>(null);
  const [hydratedWritingFormat, setHydratedWritingFormat] =
    useState<WritingReleaseFormat | null>(null);
  const [hydratedTextAlign, setHydratedTextAlign] = useState<
    'left' | 'center' | 'justify' | null
  >(null);
  const [hydrateSettled, setHydrateSettled] = useState(false);
  const [hydratedPublishedAt, setHydratedPublishedAt] = useState<number | null>(
    null
  );

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setHydratedReadables([]);
      setHydratedBookPdf(null);
      setHydratedWritingFormat(null);
      setHydratedTextAlign(null);
      setHydrateSettled(false);
      setHydratedPublishedAt(null);
    }
  }

  const readables =
    readablesProp.length > 0 ? readablesProp : hydratedReadables;
  const bookPdf = bookPdfProp ?? hydratedBookPdf;
  const writingFormat = writingFormatProp ?? hydratedWritingFormat;
  const textAlign = textAlignProp ?? hydratedTextAlign;

  useEffect(() => {
    if (!open) return;
    if (readablesProp.length > 0 || bookPdfProp) {
      setHydrateSettled(true);
      return;
    }
    const id = collectionId.trim();
    if (!id) {
      setHydrateSettled(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const rows = await createReadOnlyOnSocialClient()
          .query.scarces.collectionsCurrentByIds([id])
          .catch(() => []);
        if (cancelled) return;
        const view = rows[0] ? collectionCurrentRowToView(rows[0]) : null;
        if (!view) return;
        const hydrated = await hydrateWritingManifest(view);
        if (cancelled) return;
        if (hydrated.readables.length > 0) {
          setHydratedReadables(hydrated.readables);
        }
        if (hydrated.bookPdf) setHydratedBookPdf(hydrated.bookPdf);
        if (hydrated.writingFormat) {
          setHydratedWritingFormat(hydrated.writingFormat);
        }
        setHydratedTextAlign(hydrated.textAlign ?? null);
        if (view.createdAtMs > 0) setHydratedPublishedAt(view.createdAtMs);
      } catch {
        /* settled empty below */
      } finally {
        if (!cancelled) setHydrateSettled(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, collectionId, readablesProp.length, bookPdfProp?.cid]);

  const writePinned = useWriteDockPinned();
  const { chromeQuiet, progress, wakeFooter, onChromeTap } =
    useArticleReadChrome(scrollRootRef, open, writePinned);
  const quiet = chromeQuiet && !writePinned;

  useRegisterImmersiveChromeQuiet(open && quiet);

  const dialogName =
    visibleWorkTitle(title) || readables[0]?.title?.trim() || 'Writing';
  const sharePath = bookReaderSharePath(collectionId, tokenId);
  const issuedAt =
    (publishedAt && publishedAt > 0 ? publishedAt : null) ??
    hydratedPublishedAt;
  const connectLocked = !canRead && !isConnected;
  const showPostFooter = Boolean(footer) && !connectLocked;
  const connectFooter = connectLocked ? (
    <OsSheetFooter>
      <OsSheetActions layout="stack" tone="frosted-primary" borderless>
        <OsSheetAction
          type="button"
          variant="primary"
          ready={!isLoading}
          pending={isLoading}
          pendingLabel="Connecting…"
          disabled={isLoading}
          onClick={() => void connect()}
        >
          Connect
        </OsSheetAction>
      </OsSheetActions>
    </OsSheetFooter>
  ) : null;
  const resolvedFooter = connectFooter ?? (showPostFooter ? footer : null);
  const showWakeFooter = Boolean(resolvedFooter) && wakeFooter && !writePinned;
  const requestClose = useCallback(() => {
    if (threadOpen) {
      onDismissThread?.();
      return;
    }
    onClose();
  }, [onClose, onDismissThread, threadOpen]);

  return (
    <OsSlideOverScreen
      open={open}
      onClose={requestClose}
      title={dialogName}
      heading={<></>}
      immersiveHeader
      closeAriaLabel="Back from article"
      closeIcon={<ChevronLeftIcon className="glass-sheet-close-icon" />}
      actions={
        sharePath ? (
          <BookReaderShareAction
            open={open}
            title={dialogName}
            path={sharePath}
          />
        ) : null
      }
      zIndex={SCARCE_Z.listenShell}
      keepDock={writePinned || threadOpen}
      scrollRootRef={scrollRootRef}
      className={`${ARTICLE_READ_CLASS}${quiet ? ' is-chrome-quiet' : ''}${
        showWakeFooter ? ' is-wake-footer' : ''
      }${connectLocked ? ' is-connect-locked' : ''}${
        threadOpen ? ' feed-face-thread' : ''
      }`}
      contentClassName="feed-article-slide-body"
      footer={resolvedFooter}
      pane={pane}
    >
      <ArticleReadProgress progress={progress} />
      <div className="feed-article-read">
        <WritingReadDocument
          open={open}
          title={title}
          cover={cover}
          coverSvg={coverSvg}
          collectionId={collectionId}
          accountId={accountId}
          creatorId={creatorId}
          readables={readables}
          bookPdf={bookPdf}
          writingFormat={writingFormat}
          textAlign={textAlign}
          publishedAt={issuedAt}
          canRead={canRead}
          lockedHint={lockedHint}
          hydrateSettled={hydrateSettled}
          onChromeTap={onChromeTap}
        />
      </div>
    </OsSlideOverScreen>
  );
}
