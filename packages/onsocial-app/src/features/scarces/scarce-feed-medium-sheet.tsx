'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { Divider, GlassSheet, SheetCloseButton } from '@onsocial/ui';
import { GestureSheetHeader } from '@/components/panels/gesture-sheet-header';
import type { ScarcePlayableMedia } from '@/features/market/market-listings';
import { fetchScarceTokenMeta } from '@/features/market/market-listings';
import {
  collectionCurrentRowToView,
  fetchOwnsCollectionEdition,
} from '@/features/scarces/collections-data';
import { CollectionWritingReader } from '@/features/scarces/collection-writing-reader';
import type {
  ScarceReadableMedia,
  WritingReleaseFormat,
} from '@/features/scarces/drop-writing';
import { ScarceClipPlayer } from '@/features/scarces/scarce-clip-player';
import { accountIdsEqual } from '@/lib/account-match';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { useVisualViewportSheetMetrics } from '@/hooks/use-visual-viewport-sheet';

const VIEWER_EXIT_MS = 180;

export type ScarceFeedMediumMode = 'audio' | 'writing' | 'viewer';

export function resolveScarceFeedMediumMode(
  mediumKind: string | null | undefined
): ScarceFeedMediumMode {
  const key = (mediumKind ?? '').trim().toLowerCase();
  if (key === 'audio' || key === 'music') return 'audio';
  if (
    key === 'writing' ||
    key === 'article' ||
    key === 'book' ||
    key === 'text'
  ) {
    return 'writing';
  }
  return 'viewer';
}

/**
 * Feed cover tap → medium experience (player / reader / art shell).
 * Not the old zoom lightbox.
 */
export function ScarceFeedMediumSheet({
  open,
  onOpenChange,
  mode,
  title,
  cover = null,
  coverSvg = null,
  creatorId = null,
  collectionId = null,
  tokenId = null,
  playables: playablesProp = [],
  readables: readablesProp = [],
  writingFormat: writingFormatProp = null,
  bookPdf: bookPdfProp = null,
  viewerAccountId = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ScarceFeedMediumMode;
  title: string;
  cover?: string | null;
  /** Generated text-card SVG when there is no raster cover. */
  coverSvg?: string | null;
  creatorId?: string | null;
  collectionId?: string | null;
  tokenId?: string | null;
  playables?: ScarcePlayableMedia[];
  readables?: ScarceReadableMedia[];
  writingFormat?: WritingReleaseFormat | null;
  bookPdf?: ScarceReadableMedia | null;
  viewerAccountId?: string | null;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [hydratedPlayables, setHydratedPlayables] = useState<
    ScarcePlayableMedia[]
  >([]);
  const [hydratedReadables, setHydratedReadables] = useState<
    ScarceReadableMedia[]
  >([]);
  const [hydratedWritingFormat, setHydratedWritingFormat] =
    useState<WritingReleaseFormat | null>(null);
  const [hydratedBookPdf, setHydratedBookPdf] =
    useState<ScarceReadableMedia | null>(null);
  const [hydrateSettled, setHydrateSettled] = useState(false);
  const [holdsEdition, setHoldsEdition] = useState<boolean | null>(null);
  const [entered, setEntered] = useState(false);
  const playables =
    playablesProp.length > 0 ? playablesProp : hydratedPlayables;
  const readables =
    readablesProp.length > 0 ? readablesProp : hydratedReadables;
  const writingFormat = writingFormatProp ?? hydratedWritingFormat;
  const bookPdf = bookPdfProp ?? hydratedBookPdf;
  const sheetOpen = open && !closing;
  const isViewer = mode === 'viewer';
  const requestClose = useCallback(() => setClosing(true), []);
  const viewport = useVisualViewportSheetMetrics(sheetOpen);
  useScrollLock(open || closing);

  const isCreator =
    Boolean(viewerAccountId?.trim()) &&
    Boolean(creatorId?.trim()) &&
    accountIdsEqual(viewerAccountId!, creatorId!);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setClosing(false);
      setEntered(false);
      setHydratedPlayables([]);
      setHydratedReadables([]);
      setHydratedWritingFormat(null);
      setHydratedBookPdf(null);
      setHydrateSettled(false);
      setHoldsEdition(null);
    }
  }

  useEffect(() => {
    if (!sheetOpen) return;
    const needsAudio =
      mode === 'audio' && playables.length === 0 && (collectionId || tokenId);
    const needsWriting =
      mode === 'writing' &&
      readables.length === 0 &&
      !bookPdf &&
      Boolean(collectionId);

    if (!needsAudio && !needsWriting) {
      setHydrateSettled(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        if (collectionId) {
          const rows = await createReadOnlyOnSocialClient()
            .query.scarces.collectionsCurrentByIds([collectionId])
            .catch(() => []);
          if (cancelled) return;
          const view = rows[0] ? collectionCurrentRowToView(rows[0]) : null;
          if (view) {
            if (needsAudio && view.playables.length > 0) {
              setHydratedPlayables(view.playables);
            }
            if (needsWriting) {
              if (view.readables.length > 0) {
                setHydratedReadables(view.readables);
              }
              if (view.writingFormat) {
                setHydratedWritingFormat(view.writingFormat);
              }
              if (view.bookPdf) setHydratedBookPdf(view.bookPdf);
            }
          }
        } else if (needsAudio && tokenId) {
          const meta = await fetchScarceTokenMeta(tokenId);
          if (!cancelled && meta?.playables?.length) {
            setHydratedPlayables(meta.playables);
          }
        }
      } catch {
        /* settled empty below */
      } finally {
        if (!cancelled) setHydrateSettled(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    sheetOpen,
    mode,
    playables.length,
    readables.length,
    bookPdf,
    collectionId,
    tokenId,
  ]);

  useEffect(() => {
    if (!sheetOpen || mode !== 'writing' || !collectionId) return;
    if (isCreator) {
      setHoldsEdition(true);
      return;
    }
    if (!viewerAccountId?.trim()) {
      setHoldsEdition(false);
      return;
    }
    let cancelled = false;
    void fetchOwnsCollectionEdition(collectionId, viewerAccountId).then(
      (owns) => {
        if (!cancelled) setHoldsEdition(owns);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [sheetOpen, mode, collectionId, viewerAccountId, isCreator]);

  useEffect(() => {
    if (!sheetOpen || !isViewer) return;
    const frame = window.requestAnimationFrame(() => {
      setEntered(true);
      closeRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [sheetOpen, isViewer]);

  useEffect(() => {
    if (!isViewer || !closing) return;
    const timer = window.setTimeout(() => {
      setClosing(false);
      onOpenChange(false);
    }, VIEWER_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [closing, isViewer, onOpenChange]);

  useEffect(() => {
    if (!isViewer || !sheetOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isViewer, sheetOpen, requestClose]);

  const lightboxStyle = useMemo((): CSSProperties | undefined => {
    if (typeof window === 'undefined') return undefined;
    const vv = window.visualViewport;
    if (!viewport.isMobile || !vv || viewport.height <= 0) return undefined;
    return {
      top: vv.offsetTop,
      left: vv.offsetLeft,
      width: vv.width,
      height: vv.height,
      ['--scarce-lightbox-vh' as string]: `${viewport.height}px`,
    };
  }, [viewport.height, viewport.isMobile]);

  const name = title.trim() || 'Drop';
  const clip = playables[0] ?? null;
  const hasWriting = readables.length > 0 || bookPdf != null;
  const canReadWriting = isCreator || holdsEdition === true;
  const writingLockedHint = !viewerAccountId?.trim()
    ? 'Connect your wallet and Collect an edition to read.'
    : holdsEdition === null
      ? 'Checking your edition…'
      : 'Collect an edition to unlock the full text.';
  const inlineSvg = coverSvg?.trim() || null;
  const rasterCover = cover?.trim() || null;

  if (isViewer) {
    if (typeof document === 'undefined') return null;
    if (!open && !closing) return null;
    return createPortal(
      <div
        className={`scarce-card-lightbox scarce-clip-listen-lightbox${
          entered && !closing ? ' is-open' : ''
        }${closing ? ' is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={lightboxStyle}
        onClick={requestClose}
      >
        {inlineSvg && !rasterCover ? (
          <>
            <p id={titleId} className="sr-only">
              {name}
            </p>
            <div className="scarce-card-lightbox-chrome">
              <SheetCloseButton
                ref={closeRef}
                onClick={requestClose}
                ariaLabel="Close preview"
                className="scarce-card-lightbox-close"
              />
            </div>
            <div
              className="scarce-card-lightbox-asset scarce-card-lightbox-svg"
              dangerouslySetInnerHTML={{ __html: inlineSvg }}
              onClick={(event) => event.stopPropagation()}
            />
          </>
        ) : (
          <div
            className="scarce-clip-listen"
            onClick={(event) => event.stopPropagation()}
          >
            <p id={titleId} className="sr-only">
              {name}
            </p>
            <div className="scarce-card-lightbox-chrome">
              <SheetCloseButton
                ref={closeRef}
                onClick={requestClose}
                ariaLabel="Close preview"
                className="scarce-card-lightbox-close"
              />
            </div>
            <div className="scarce-clip-listen-art">
              {rasterCover ? (
                <img
                  src={rasterCover}
                  alt=""
                  className="scarce-clip-listen-cover"
                />
              ) : (
                <div
                  className="scarce-clip-listen-cover scarce-clip-listen-cover--empty"
                  aria-hidden
                />
              )}
            </div>
            <div className="scarce-clip-listen-copy">
              <p className="scarce-clip-listen-track">{name}</p>
            </div>
          </div>
        )}
      </div>,
      document.body
    );
  }

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={() => {
        setClosing(false);
        onOpenChange(false);
      }}
      tone="os"
      initialDetent="full"
      peekRatio={1}
      zIndex={56}
      ariaLabelledBy={titleId}
      backdropLabel={mode === 'audio' ? 'Close listen' : 'Close reader'}
      bodyClassName="profile-support-sheet-body"
      header={
        <>
          <GestureSheetHeader
            titleId={titleId}
            verb={mode === 'audio' ? 'Listen' : 'Read'}
            personName=""
            handle={name}
            signal="reputation"
            closeAriaLabel={mode === 'audio' ? 'Close listen' : 'Close reader'}
            onClose={requestClose}
            whisper={
              mode === 'audio' ? 'Preview this Drop' : 'Drop writing'
            }
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      {sheetOpen && mode === 'audio' && clip ? (
        <ScarceClipPlayer
          clip={clip}
          tracks={playables}
          poster={rasterCover}
          layout="cover"
          creatorId={creatorId}
          showTransport
          {...(collectionId
            ? { persist: { collectionId, title: name } }
            : {})}
        />
      ) : null}
      {sheetOpen && mode === 'audio' && !clip ? (
        <p className="scarce-feed-medium-empty">
          {hydrateSettled
            ? 'Audio unavailable for this Drop.'
            : 'Loading audio…'}
        </p>
      ) : null}
      {sheetOpen && mode === 'writing' && collectionId && hasWriting ? (
        <CollectionWritingReader
          collectionId={collectionId}
          accountId={viewerAccountId}
          readables={readables}
          bookPdf={bookPdf}
          writingFormat={writingFormat}
          canRead={canReadWriting}
          lockedHint={writingLockedHint}
        />
      ) : null}
      {sheetOpen &&
      mode === 'writing' &&
      (!hasWriting || !collectionId) ? (
        <p className="scarce-feed-medium-empty">
          {!collectionId
            ? 'Open the Drop to read this release.'
            : hydrateSettled
              ? 'Writing unavailable for this Drop.'
              : 'Loading writing…'}
        </p>
      ) : null}
    </GlassSheet>
  );
}
