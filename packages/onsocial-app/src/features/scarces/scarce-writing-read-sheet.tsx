'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  ActionDrawer,
  type ActionDrawerItem,
  DotsVerticalIcon,
  DownloadIcon,
  GiftIcon,
  ImageIcon,
  NoteTextIcon,
  OsSheetAction,
  OsSheetActions,
  OsSheetFooter,
  UserIcon,
} from '@onsocial/ui';
import { OsMediaFaceShell } from '@/components/os/os-media-face-shell';
import { ProfileSupportSheet } from '@/components/portfolio/profile-support-sheet';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useRegisterImmersiveChromeQuiet } from '@/contexts/dock-chrome-context';
import { useWriteDockPinned } from '@/contexts/compose-launcher-context';
import {
  CollectionWritingReader,
  type WritingReaderActions,
} from '@/features/scarces/collection-writing-reader';
import {
  collectionCurrentRowToView,
  hydrateWritingManifest,
} from '@/features/scarces/collections-data';
import { DropArtOverlay } from '@/features/scarces/drop-artwork-preview';
import type {
  ScarceReadableMedia,
  WritingReleaseFormat,
} from '@/features/scarces/drop-writing';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { isDownloadAbort } from '@/lib/media-download';
import { portfolioPath } from '@/lib/overlay-routes';
import { displayName } from '@/lib/profile-display';

function visibleWorkTitle(value: string): string {
  const next = value.trim();
  return next && next.toLowerCase() !== 'drop' ? next : '';
}

function inlineSvgMarkup(svg: string): string {
  return svg.replace(/^<\?xml[^>]*>\s*/i, '');
}

function WritingReaderMenu({
  title,
  creatorId,
  hasCover,
  readerActions,
  onOpenCover,
  onOpenContents,
}: {
  title: string;
  creatorId?: string | null;
  hasCover: boolean;
  readerActions: WritingReaderActions | null;
  onOpenCover: () => void;
  onOpenContents: () => void;
}) {
  const { setTxResult } = useAppTransactionFeedback();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [downloading, setDownloading] = useState<'chapter' | 'book' | null>(
    null
  );
  const isOpen = open && !closing;
  const requestClose = useCallback(() => setClosing(true), []);
  const handleClosed = useCallback(() => {
    setClosing(false);
    setOpen(false);
  }, []);
  const authorId = creatorId?.trim() || '';

  const runDownload = async (
    kind: 'chapter' | 'book',
    download: () => Promise<void>
  ) => {
    if (downloading) return;
    setDownloading(kind);
    try {
      await download();
      requestClose();
    } catch (error) {
      if (isDownloadAbort(error)) return;
      setTxResult({
        type: 'error',
        msg:
          kind === 'book'
            ? 'Could not download this book.'
            : 'Could not download this chapter.',
      });
    } finally {
      setDownloading(null);
    }
  };

  const items = useMemo<ActionDrawerItem[]>(() => {
    const next: ActionDrawerItem[] = [];
    if (readerActions?.isBook) {
      next.push({
        id: 'contents',
        label: 'Contents',
        leading: <NoteTextIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: () => {
          onOpenContents();
          requestClose();
        },
      });
    }
    if (readerActions?.canDownloadChapter) {
      next.push({
        id: 'download-chapter',
        label: downloading === 'chapter' ? 'Downloading…' : 'Download chapter',
        disabled: downloading != null,
        leading: <DownloadIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: () => void runDownload('chapter', readerActions.downloadChapter),
      });
    }
    if (readerActions?.canDownloadBook) {
      next.push({
        id: 'download-book',
        label: downloading === 'book' ? 'Downloading…' : 'Download book',
        disabled: downloading != null,
        leading: <DownloadIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: () => void runDownload('book', readerActions.downloadBook),
      });
    }
    if (hasCover) {
      next.push({
        id: 'cover',
        label: 'Cover',
        leading: <ImageIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: () => {
          onOpenCover();
          requestClose();
        },
      });
    }
    if (authorId) {
      next.push({
        id: 'author',
        label: 'Author',
        href: portfolioPath(authorId),
        leading: <UserIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: () => requestClose(),
      });
      next.push({
        id: 'support',
        label: 'Support',
        leading: <GiftIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: () => {
          setSupportOpen(true);
          requestClose();
        },
      });
    }
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authorId,
    downloading,
    hasCover,
    onOpenContents,
    onOpenCover,
    readerActions,
  ]);

  if (items.length === 0) return null;

  return (
    <>
      <div className={`post-card-menu${isOpen ? ' is-open' : ''}`}>
        <button
          type="button"
          className={`post-card-menu-trigger${isOpen ? ' is-open' : ''}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-label="More"
        >
          <DotsVerticalIcon className="glass-sheet-close-icon" aria-hidden />
        </button>
        <ActionDrawer
          open={isOpen}
          onClose={requestClose}
          onClosed={handleClosed}
          label={title}
          listAriaLabel={title}
          closeAriaLabel="Close"
          items={items}
          zIndex={SCARCE_Z.nestedOverCommerce}
        />
      </div>
      {authorId ? (
        <ProfileSupportSheet
          open={supportOpen}
          pageAccountId={authorId}
          onOpenChange={setSupportOpen}
          zIndex={SCARCE_Z.nestedOverCommerce}
        />
      ) : null}
    </>
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
  accountId = null,
  creatorId = null,
  readables: readablesProp,
  bookPdf: bookPdfProp = null,
  writingFormat: writingFormatProp = null,
  textAlign: textAlignProp = null,
  canRead,
  lockedHint,
  footer = null,
}: {
  open: boolean;
  onClose: () => void;
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
  canRead: boolean;
  lockedHint: string;
  footer?: ReactNode;
}) {
  const { isConnected, connect, isLoading } = useAppWallet();
  const seekProgressRef = useRef<((ratio: number) => void) | null>(null);
  const scrubbingRef = useRef(false);
  const chromeQuietAccumRef = useRef(0);
  const [wasOpen, setWasOpen] = useState(open);
  const [scrollRatio, setScrollRatio] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [chromeQuiet, setChromeQuiet] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
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
  const authorId = creatorId?.trim() || '';
  const authorProfiles = usePostAuthorProfiles(authorId ? [authorId] : []);
  const authorProfile = authorId ? authorProfiles[authorId] : undefined;
  const authorName = authorId
    ? displayName(authorId, authorProfile?.displayName)
    : '';
  const [readerActions, setReaderActions] =
    useState<WritingReaderActions | null>(null);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setScrollRatio(0);
      setCoverOpen(false);
      setScrubbing(false);
      scrubbingRef.current = false;
      setChromeQuiet(false);
      chromeQuietAccumRef.current = 0;
      setHydratedReadables([]);
      setHydratedBookPdf(null);
      setHydratedWritingFormat(null);
      setHydratedTextAlign(null);
      setHydrateSettled(false);
      setReaderActions(null);
    } else {
      setCoverOpen(false);
      setReaderActions(null);
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

  const onReadingProgress = useCallback((ratio: number) => {
    if (scrubbingRef.current) return;
    setScrollRatio(ratio);
    if (ratio <= 0.015) {
      chromeQuietAccumRef.current = 0;
      setChromeQuiet(false);
    }
  }, []);

  const endScrub = useCallback(() => {
    scrubbingRef.current = false;
    setScrubbing(false);
  }, []);

  const beginScrub = useCallback(() => {
    scrubbingRef.current = true;
    setScrubbing(true);
  }, []);

  const seekReading = useCallback((ratio: number) => {
    const next = Math.min(1, Math.max(0, ratio));
    setScrollRatio(next);
    seekProgressRef.current?.(next);
  }, []);

  const onScrollDelta = useCallback((deltaY: number) => {
    if (scrubbingRef.current) return;
    const next = Math.max(
      -48,
      Math.min(48, chromeQuietAccumRef.current + deltaY)
    );
    chromeQuietAccumRef.current = next;
    if (next > 28) {
      setChromeQuiet(true);
      chromeQuietAccumRef.current = 0;
    } else if (next < -20) {
      setChromeQuiet(false);
      chromeQuietAccumRef.current = 0;
    }
  }, []);

  const onChromeTap = useCallback(() => {
    chromeQuietAccumRef.current = 0;
    setChromeQuiet((quiet) => !quiet);
  }, []);

  const onReaderActions = useCallback((next: WritingReaderActions | null) => {
    setReaderActions(next);
  }, []);

  const onOpenCover = useCallback(() => {
    setCoverOpen(true);
  }, []);

  const onOpenContents = useCallback(() => {
    chromeQuietAccumRef.current = 0;
    setChromeQuiet(false);
    readerActions?.openContents();
  }, [readerActions]);

  useRegisterImmersiveChromeQuiet(open && chromeQuiet);

  /* Reply / compose — wake jacket quiet so dock + icon strip stay paired. */
  const writePinned = useWriteDockPinned();
  useEffect(() => {
    if (!open || !writePinned) return;
    chromeQuietAccumRef.current = 0;
    setChromeQuiet(false);
  }, [open, writePinned]);

  const workTitle =
    visibleWorkTitle(title) || readables[0]?.title?.trim() || '';
  const dialogName = workTitle || authorName || 'Writing';
  const inlineSvg = coverSvg?.trim() ? inlineSvgMarkup(coverSvg.trim()) : null;
  const rasterCover = cover?.trim() || null;
  const hasWriting = readables.length > 0 || bookPdf != null;
  const progressPct = Math.round(Math.min(1, Math.max(0, scrollRatio)) * 100);
  const progressSteps = 1000;
  const progressValue = Math.round(
    Math.min(1, Math.max(0, scrollRatio)) * progressSteps
  );
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

  const progress = (
    <div
      className={`scarce-writing-read-progress${
        scrubbing ? ' is-scrubbing' : ''
      }${!hasWriting ? ' is-disabled' : ''}`}
    >
      <div className="scarce-writing-read-progress-rail" aria-hidden>
        <div className="scarce-writing-read-progress-fill" />
        <span className="scarce-writing-read-progress-knob" />
      </div>
      <input
        type="range"
        className="scarce-writing-read-progress-scrub"
        min={0}
        max={progressSteps}
        step={1}
        value={progressValue}
        aria-label="Reading progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPct}
        disabled={!hasWriting}
        onPointerDown={(event) => {
          if (!hasWriting) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          beginScrub();
          const rect = event.currentTarget.getBoundingClientRect();
          if (rect.width > 0) {
            seekReading((event.clientX - rect.left) / rect.width);
          }
        }}
        onPointerMove={(event) => {
          if (!scrubbingRef.current || !hasWriting) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (rect.width <= 0) return;
          seekReading((event.clientX - rect.left) / rect.width);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          endScrub();
        }}
        onPointerCancel={endScrub}
        onChange={(event) => {
          seekReading(Number(event.target.value) / progressSteps);
        }}
      />
    </div>
  );

  return (
    <OsMediaFaceShell
      open={open}
      onClose={onClose}
      title={dialogName}
      quietTitle
      closeAriaLabel="Back from reader"
      zIndex={SCARCE_Z.listenShell}
      keepDock
      trailing={
        <WritingReaderMenu
          title={authorName || dialogName}
          creatorId={creatorId}
          hasCover={Boolean(rasterCover || inlineSvg)}
          readerActions={readerActions}
          onOpenCover={onOpenCover}
          onOpenContents={onOpenContents}
        />
      }
      progress={progress}
      footer={showPostFooter ? footer : null}
      footerChrome={connectFooter}
      chromeQuiet={chromeQuiet}
      bodyClassName={`scarce-writing-read${
        connectLocked ? ' is-connect-locked' : ''
      }`}
      bodyStyle={
        {
          '--scarce-writing-p': String(Math.min(1, Math.max(0, scrollRatio))),
        } as CSSProperties
      }
    >
      <div className="scarce-writing-read-body">
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
            onProgress={onReadingProgress}
            onScrollDelta={onScrollDelta}
            onChromeTap={onChromeTap}
            seekProgressRef={seekProgressRef}
            workTitle={workTitle}
            creatorId={authorId || null}
            creatorName={authorName || null}
            creatorAvatarUrl={authorProfile?.avatarUrl ?? null}
            onReaderActions={onReaderActions}
          />
        ) : (
          <p className="scarce-feed-medium-empty">
            {!hydrateSettled
              ? 'Loading writing…'
              : 'Writing unavailable for this Drop.'}
          </p>
        )}
      </div>

      {(rasterCover || inlineSvg) && coverOpen ? (
        <DropArtOverlay
          open={coverOpen}
          src={rasterCover ?? undefined}
          svg={inlineSvg && !rasterCover ? inlineSvg : null}
          label={dialogName}
          onClose={() => setCoverOpen(false)}
        />
      ) : null}
    </OsMediaFaceShell>
  );
}
