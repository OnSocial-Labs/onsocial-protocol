'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
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
import {
  resolveScarceFeedMediumMode,
  type ScarceFeedMediumMode,
} from '@/features/scarces/scarce-feed-medium-mode';

const VIEWER_EXIT_MS = 180;

export type { ScarceFeedMediumMode };
export { resolveScarceFeedMediumMode };

function inlineSvgMarkup(svg: string): string {
  return svg.replace(/^<\?xml[^>]*>\s*/i, '');
}

/**
 * Feed cover tap → post-origin medium shell.
 * Cover stays feed-scale; green Mint/Buy + engagement sit under the art
 * (including the audio player) for quick post actions.
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
  commerce = null,
  engagement = null,
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
  /** Post Mint/Buy row (green price). */
  commerce?: ReactNode;
  /** Post reply / quote / like / boost row. */
  engagement?: ReactNode;
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
  const isOverlay = mode === 'viewer' || mode === 'audio';
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
    if (!sheetOpen || !isOverlay) return;
    const frame = window.requestAnimationFrame(() => {
      setEntered(true);
      closeRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [sheetOpen, isOverlay]);

  useEffect(() => {
    if (!isOverlay || !closing) return;
    const timer = window.setTimeout(() => {
      setClosing(false);
      onOpenChange(false);
    }, VIEWER_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [closing, isOverlay, onOpenChange]);

  useEffect(() => {
    if (!isOverlay || !sheetOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOverlay, sheetOpen, requestClose]);

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
  const inlineSvg = coverSvg?.trim() ? inlineSvgMarkup(coverSvg.trim()) : null;
  const rasterCover = cover?.trim() || null;
  const postChrome =
    commerce || engagement ? (
      <div
        className="scarce-post-medium-chrome"
        onClick={(event) => event.stopPropagation()}
      >
        {commerce}
        {engagement}
      </div>
    ) : null;

  const coverArt =
    inlineSvg && !rasterCover ? (
      <div
        className="scarce-post-medium-cover scarce-post-medium-cover--svg"
        dangerouslySetInnerHTML={{ __html: inlineSvg }}
      />
    ) : rasterCover ? (
      <img src={rasterCover} alt="" className="scarce-post-medium-cover" />
    ) : (
      <div
        className="scarce-post-medium-cover scarce-post-medium-cover--empty"
        aria-hidden
      />
    );

  if (isOverlay) {
    if (typeof document === 'undefined') return null;
    if (!open && !closing) return null;
    return createPortal(
      <div
        className={`scarce-card-lightbox scarce-post-medium-lightbox${
          entered && !closing ? ' is-open' : ''
        }${closing ? ' is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={lightboxStyle}
        onClick={requestClose}
      >
        <div
          className="scarce-post-medium"
          onClick={(event) => event.stopPropagation()}
        >
          <p id={titleId} className="sr-only">
            {name}
          </p>
          <div className="scarce-post-medium-top">
            <SheetCloseButton
              ref={closeRef}
              onClick={requestClose}
              ariaLabel="Close preview"
              className="scarce-post-medium-close"
            />
          </div>
          <div className="scarce-post-medium-stage">
            {mode === 'audio' && clip ? (
              <div className="scarce-post-medium-player">
                <ScarceClipPlayer
                  clip={clip}
                  tracks={playables}
                  poster={rasterCover}
                  layout="cover"
                  creatorId={creatorId}
                  showTransport
                  showTracks={false}
                  {...(collectionId
                    ? { persist: { collectionId, title: name } }
                    : {})}
                />
              </div>
            ) : mode === 'audio' && !clip ? (
              <>
                {coverArt}
                <p className="scarce-feed-medium-empty">
                  {hydrateSettled
                    ? 'Audio unavailable for this Drop.'
                    : 'Loading audio…'}
                </p>
              </>
            ) : (
              coverArt
            )}
          </div>
          {name ? <p className="scarce-post-medium-title">{name}</p> : null}
          {postChrome}
        </div>
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
      backdropLabel="Close reader"
      bodyClassName="profile-support-sheet-body"
      header={
        <>
          <GestureSheetHeader
            titleId={titleId}
            verb="Read"
            personName=""
            handle={name}
            signal="reputation"
            closeAriaLabel="Close reader"
            onClose={requestClose}
            whisper="Drop writing"
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      {postChrome}
      {sheetOpen && collectionId && hasWriting ? (
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
      {sheetOpen && (!hasWriting || !collectionId) ? (
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
