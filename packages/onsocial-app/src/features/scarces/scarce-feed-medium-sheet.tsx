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
import {
  OsGestureSheet,
  ScaleDownIcon,
  useScrollLock,
} from '@onsocial/ui';
import type { ScarcePlayableMedia } from '@/features/market/market-listings';
import { fetchScarceTokenMeta } from '@/features/market/market-listings';
import {
  collectionCurrentRowToView,
  fetchOwnsCollectionEdition,
  hydrateWritingManifest,
} from '@/features/scarces/collections-data';
import { CollectionWritingReader } from '@/features/scarces/collection-writing-reader';
import type {
  ScarceReadableMedia,
  WritingReleaseFormat,
} from '@/features/scarces/drop-writing';
import { ScarceClipPlayer } from '@/features/scarces/scarce-clip-player';
import { WritingReadSheet } from '@/features/scarces/scarce-writing-read-sheet';
import { accountIdsEqual } from '@/lib/account-match';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
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
 * Feed cover tap → shared listen-player card shell.
 *
 * Audio opens the real listen player with Mint/Buy + engagement under the
 * cover. Thought/art uses the same card without transport. Writing keeps the
 * immersive reader for now (same shell + Read stack is a follow-up).
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
  const clip = playables[0] ?? null;
  /** Audio with a playable uses the real listen enlarge (no custom lightbox). */
  const immersiveAudio = mode === 'audio' && clip != null && open;
  /** Writing uses the dedicated read lightbox (cover + manuscript). */
  const immersiveWriting = mode === 'writing' && open;
  const isOverlay = mode === 'viewer' || (mode === 'audio' && !clip);
  const requestClose = useCallback(() => setClosing(true), []);
  const viewport = useVisualViewportSheetMetrics(sheetOpen);
  // Overlay / listen paths need host lock; OsGestureSheet locks the reader sheet.
  useScrollLock((isOverlay || immersiveAudio) && (open || closing));

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
              const hydrated = await hydrateWritingManifest(view);
              if (cancelled) return;
              if (hydrated.readables.length > 0) {
                setHydratedReadables(hydrated.readables);
              }
              if (hydrated.writingFormat) {
                setHydratedWritingFormat(hydrated.writingFormat);
              }
              if (hydrated.bookPdf) setHydratedBookPdf(hydrated.bookPdf);
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
        className="scarce-clip-listen-cover scarce-post-medium-cover--svg"
        dangerouslySetInnerHTML={{ __html: inlineSvg }}
      />
    ) : rasterCover ? (
      <img src={rasterCover} alt="" className="scarce-clip-listen-cover" />
    ) : (
      <div
        className="scarce-clip-listen-cover scarce-clip-listen-cover--empty"
        aria-hidden
      />
    );

  if (immersiveAudio) {
    if (!open) return null;
    return (
      <ScarceClipPlayer
        clip={clip}
        tracks={playables}
        poster={rasterCover}
        layout="cover"
        creatorId={creatorId}
        showTransport
        showTracks={false}
        immersiveListen
        listenFooter={postChrome}
        onListenClose={() => onOpenChange(false)}
        {...(collectionId ? { persist: { collectionId, title: name } } : {})}
      />
    );
  }

  if (immersiveWriting && collectionId) {
    return (
      <WritingReadSheet
        open={open}
        onClose={() => onOpenChange(false)}
        title={name}
        cover={rasterCover}
        coverSvg={coverSvg}
        collectionId={collectionId}
        accountId={viewerAccountId}
        readables={readables}
        bookPdf={bookPdf}
        writingFormat={writingFormat}
        canRead={canReadWriting}
        lockedHint={
          !hydrateSettled && !hasWriting
            ? 'Loading writing…'
            : writingLockedHint
        }
        footer={postChrome}
      />
    );
  }

  if (isOverlay) {
    if (typeof document === 'undefined') return null;
    if (!open && !closing) return null;
    return createPortal(
      <div
        className={`scarce-card-lightbox scarce-clip-listen-lightbox scarce-post-medium-lightbox${
          entered && !closing ? ' is-open' : ''
        }${closing ? ' is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={lightboxStyle}
      >
        <div className="scarce-clip-listen scarce-post-medium-listen">
          <p id={titleId} className="sr-only">
            {name}
          </p>
          <div className="scarce-clip-listen-art">{coverArt}</div>
          {mode === 'audio' ? (
            <p className="scarce-feed-medium-empty">
              {hydrateSettled
                ? 'Audio unavailable for this Drop.'
                : 'Loading audio…'}
            </p>
          ) : null}
          {postChrome ? (
            <div className="scarce-clip-listen-footer">{postChrome}</div>
          ) : null}
          <div className="scarce-post-medium-dismiss">
            <button
              ref={closeRef}
              type="button"
              className="scarce-clip-cover-expand scarce-clip-listen-contract"
              aria-label="Close preview"
              onClick={requestClose}
            >
              <ScaleDownIcon
                className="scarce-clip-cover-expand-icon"
                aria-hidden
              />
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return (
    <OsGestureSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={() => {
        setClosing(false);
        onOpenChange(false);
      }}
      verb="Read"
      personName=""
      handle={name}
      signal="reputation"
      whisper="Drop writing"
      closeAriaLabel="Close reader"
      backdropLabel="Close reader"
      size="compact"
      bodyClassName="profile-support-sheet-body"
      titleId={titleId}
      zIndex={56}
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
    </OsGestureSheet>
  );
}
