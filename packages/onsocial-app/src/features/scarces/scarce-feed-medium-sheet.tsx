'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { OsMediaFaceShell } from '@/components/os/os-media-face-shell';
import type { ScarcePlayableMedia } from '@/features/market/market-listings';
import { fetchScarceTokenMeta } from '@/features/market/market-listings';
import {
  collectionCurrentRowToView,
  hydrateWritingManifest,
} from '@/features/scarces/collections-data';
import type {
  ScarceReadableMedia,
  WritingReleaseFormat,
} from '@/features/scarces/drop-writing';
import { ScarceClipPlayer } from '@/features/scarces/scarce-clip-player';
import { WritingReadSheet } from '@/features/scarces/scarce-writing-read-sheet';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  resolveScarceFeedMediumMode,
  type ScarceFeedMediumMode,
} from '@/features/scarces/scarce-feed-medium-mode';

export type { ScarceFeedMediumMode };
export { resolveScarceFeedMediumMode };

function inlineSvgMarkup(svg: string): string {
  return svg.replace(/^<\?xml[^>]*>\s*/i, '');
}

/**
 * Feed / Drops cover tap → shared media-face enlarge.
 *
 * Audio opens Listen. Writing opens Read. Thought/art uses the same jacket
 * + frost footer without transport or progress.
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
  const [hydratedTextAlign, setHydratedTextAlign] = useState<
    'left' | 'center' | 'justify' | null
  >(null);
  const [hydrateSettled, setHydrateSettled] = useState(false);
  const playables =
    playablesProp.length > 0 ? playablesProp : hydratedPlayables;
  const readables =
    readablesProp.length > 0 ? readablesProp : hydratedReadables;
  const writingFormat = writingFormatProp ?? hydratedWritingFormat;
  const bookPdf = bookPdfProp ?? hydratedBookPdf;
  const clip = playables[0] ?? null;
  /** Audio with a playable uses the real listen enlarge. */
  const immersiveAudio = mode === 'audio' && clip != null && open;
  /** Writing uses the dedicated read screen. */
  const immersiveWriting = mode === 'writing' && open;
  const isOverlay = mode === 'viewer' || (mode === 'audio' && !clip);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setHydratedPlayables([]);
      setHydratedReadables([]);
      setHydratedWritingFormat(null);
      setHydratedBookPdf(null);
      setHydratedTextAlign(null);
      setHydrateSettled(false);
    }
  }

  useEffect(() => {
    if (!open) return;
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
              setHydratedTextAlign(hydrated.textAlign ?? null);
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
    open,
    mode,
    playables.length,
    readables.length,
    bookPdf,
    collectionId,
    tokenId,
  ]);

  const name = title.trim() || 'Drop';
  const hasWriting = readables.length > 0 || bookPdf != null;
  const canReadWriting = true;
  const writingLockedHint =
    !hydrateSettled && !hasWriting ? 'Loading writing…' : '';
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
        className="scarce-thought-art scarce-thought-art--svg"
        dangerouslySetInnerHTML={{ __html: inlineSvg }}
      />
    ) : rasterCover ? (
      <img src={rasterCover} alt="" className="scarce-thought-art" />
    ) : (
      <div
        className="scarce-thought-art scarce-thought-art--empty"
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

  if (immersiveWriting) {
    return (
      <WritingReadSheet
        open={open}
        onClose={() => onOpenChange(false)}
        title={name}
        cover={rasterCover}
        coverSvg={coverSvg}
        collectionId={collectionId?.trim() || ''}
        accountId={viewerAccountId}
        readables={readables}
        bookPdf={bookPdf}
        writingFormat={writingFormat}
        textAlign={hydratedTextAlign}
        canRead={canReadWriting}
        lockedHint={
          !collectionId?.trim()
            ? 'Open the Drop to read this release.'
            : writingLockedHint
        }
        footer={postChrome}
      />
    );
  }

  if (isOverlay) {
    return (
      <OsMediaFaceShell
        open={open}
        onClose={() => onOpenChange(false)}
        title={name}
        closeAriaLabel="Back from preview"
        zIndex={SCARCE_Z.listenShell}
        footer={postChrome}
        stageLayout="fixed"
        className="scarce-thought-slide"
        contentClassName="scarce-thought-slide-body"
      >
        <div className="scarce-thought-body">
          <div className="scarce-thought-stage">{coverArt}</div>
          {mode === 'audio' ? (
            <p className="scarce-feed-medium-empty">
              {hydrateSettled
                ? 'Audio unavailable for this Drop.'
                : 'Loading audio…'}
            </p>
          ) : null}
        </div>
      </OsMediaFaceShell>
    );
  }

  return null;
}
