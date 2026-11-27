'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { PostRow } from '@onsocial/sdk';
import { IpfsImg, ipfsImgSrcSet } from '@onsocial/ui';
import { OsMediaFaceShell } from '@/components/os/os-media-face-shell';
import { SCARCE_HERO_WIDTHS, SQUARE_ART_SIZES } from '@/lib/hero-img-variants';
import { useWriteDockPinned } from '@/contexts/compose-launcher-context';
import { useRegisterImmersiveChromeQuiet } from '@/contexts/dock-chrome-context';
import { useOsDropSheetOpen } from '@/hooks/use-os-drop-sheet-open';
import {
  FeedFaceThreadPane,
  FeedMediaThreadSheet,
} from '@/features/home/feed-media-thread-sheet';
import {
  threadJacketT,
  useFeedThreadBand,
} from '@/features/home/use-feed-thread-band';
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
import { scarcePlaybackSessionId } from '@/features/scarces/scarce-playback-session';
import { WritingReadSheet } from '@/features/scarces/scarce-writing-read-sheet';
import { usePostLayerOwnerZ } from '@/features/home/post-layer-owner-z';
import { postLayerOverlayZ } from '@/lib/sheet-z';
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

/** Seat for listen open before playables land — same face, no Loading remount. */
const PENDING_FEED_AUDIO_CLIP: ScarcePlayableMedia = {
  url: '',
  mime: 'audio/mpeg',
};

/**
 * Feed / Drops cover tap → shared media-face enlarge.
 *
 * Audio opens Listen. Writing opens Read. Reply on each opens the same
 * thread drawer as a photo. Thought/art uses that drawer on the jacket.
 */
export function ScarceFeedMediumSheet({
  open,
  onOpenChange,
  onClosed,
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
  threadOpen = false,
  onDismissThread = null,
  threadAuthor = null,
  threadPostId = null,
  threadRoot = null,
  trailing = null,
  feedEnlarge = false,
  peekIdentity = null,
  caption = null,
  captionDate = null,
  coverPlayNonce = 0,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After the exit slide — parents drop the tree (overlay-idle). */
  onClosed?: () => void;
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
  /** Reply drawer — same as video enlarge (write dock lives there). */
  threadOpen?: boolean;
  onDismissThread?: (() => void) | null;
  threadAuthor?: string | null;
  threadPostId?: string | null;
  threadRoot?: PostRow | null;
  /** Jacket ⋯ — same post options as video enlarge. */
  trailing?: ReactNode;
  /**
   * Feed post audio: cover face first, same as video. The full player
   * opens from that face. Drop pages leave this off.
   */
  feedEnlarge?: boolean;
  peekIdentity?: ReactNode;
  caption?: string | null;
  captionDate?: string | null;
  /** Cover tapped again. The player continues and takes the speakers. */
  coverPlayNonce?: number;
}) {
  const faceZ = postLayerOverlayZ(usePostLayerOwnerZ()).face;
  const [wasOpen, setWasOpen] = useState(open);
  const writePinned = useWriteDockPinned();
  const dropSheetOpen = useOsDropSheetOpen();
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
  const resolvedClip = playables[0] ?? null;
  const hasPlayableUrl = Boolean(resolvedClip?.url?.trim());
  /** Listen always mounts the real face — never a Loading shell that remounts. */
  const clip =
    resolvedClip ??
    (mode === 'audio' && open ? PENDING_FEED_AUDIO_CLIP : null);
  const playbackSessionId = scarcePlaybackSessionId({ collectionId, tokenId });
  const immersiveAudio = mode === 'audio' && open && clip != null;
  /** Writing uses the dedicated read screen. */
  const immersiveWriting = mode === 'writing' && open;
  const isOverlay = mode === 'viewer';
  const audioUnavailable =
    mode === 'audio' && open && hydrateSettled && !hasPlayableUrl;

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

  const dismissThread = useCallback(() => {
    onDismissThread?.();
  }, [onDismissThread]);
  const {
    band: threadBand,
    dragging: threadDragging,
    gripHandlers,
  } = useFeedThreadBand(
    Boolean(open && isOverlay && threadOpen),
    dismissThread
  );
  const jacketT = threadJacketT(
    Boolean(open && isOverlay && threadOpen),
    threadBand
  );
  // Soft Drop owns Mint/Back — do not tuck the pill under a quiet face.
  useRegisterImmersiveChromeQuiet(
    open && isOverlay && !threadOpen && !dropSheetOpen
  );

  /* Ignore the pointer that opened the drawer — footer unmounts and the
   * leftover pointerup lands on the art, which would close it instantly. */
  const ignoreArtDismissRef = useRef(false);
  useEffect(() => {
    if (!threadOpen) {
      ignoreArtDismissRef.current = false;
      return;
    }
    ignoreArtDismissRef.current = true;
    const timer = window.setTimeout(() => {
      ignoreArtDismissRef.current = false;
    }, 480);
    return () => window.clearTimeout(timer);
  }, [threadOpen]);

  const handleArtTap = useCallback(() => {
    if (threadOpen && onDismissThread) {
      if (ignoreArtDismissRef.current) return;
      onDismissThread();
    }
  }, [threadOpen, onDismissThread]);

  const name = title.trim() || 'Drop';
  const canReadWriting = true;
  const inlineSvg = coverSvg?.trim() ? inlineSvgMarkup(coverSvg.trim()) : null;
  const rasterCover = cover?.trim() || null;
  const rasterCoverSrcSet = ipfsImgSrcSet(rasterCover, SCARCE_HERO_WIDTHS);
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
      <IpfsImg
        src={rasterCover}
        srcSet={rasterCoverSrcSet}
        sizes={rasterCoverSrcSet ? SQUARE_ART_SIZES : undefined}
        alt=""
        className="scarce-thought-art"
        decoding="async"
      />
    ) : (
      <div
        className="scarce-thought-art scarce-thought-art--empty"
        aria-hidden
      />
    );

  if (immersiveAudio) {
    return (
      <ScarceClipPlayer
        clip={clip}
        tracks={hasPlayableUrl ? playables : []}
        poster={rasterCover}
        layout="cover"
        creatorId={creatorId}
        showTransport
        showTracks={false}
        immersiveListen
        feedEnlarge={feedEnlarge}
        faceOpen={open}
        peekIdentity={peekIdentity}
        caption={
          audioUnavailable ? 'Audio unavailable for this Drop.' : caption
        }
        captionDate={audioUnavailable ? null : captionDate}
        enlargeTrailing={trailing}
        listenFooter={postChrome}
        listenKeepDock={writePinned || threadOpen || dropSheetOpen}
        threadOpen={threadOpen}
        onDismissThread={dismissThread}
        threadAuthor={threadAuthor}
        threadPostId={threadPostId}
        threadRoot={threadRoot}
        onListenClose={() => onOpenChange(false)}
        onListenClosed={onClosed}
        coverPlayNonce={coverPlayNonce}
        {...(playbackSessionId
          ? { persist: { collectionId: playbackSessionId, title: name } }
          : {})}
      />
    );
  }

  if (immersiveWriting) {
    return (
      <WritingReadSheet
        open={open}
        onClose={() => onOpenChange(false)}
        onClosed={onClosed}
        title={name}
        cover={rasterCover}
        coverSvg={coverSvg}
        collectionId={collectionId?.trim() || ''}
        tokenId={tokenId}
        accountId={viewerAccountId}
        creatorId={creatorId}
        readables={readables}
        bookPdf={bookPdf}
        writingFormat={writingFormat}
        textAlign={hydratedTextAlign}
        canRead={canReadWriting}
        lockedHint={
          !collectionId?.trim() ? 'Open the Drop to read this release.' : ''
        }
        footer={postChrome}
        threadOpen={threadOpen}
        onDismissThread={dismissThread}
        pane={
          <FeedFaceThreadPane
            open={Boolean(open && threadOpen)}
            onDismiss={dismissThread}
            author={threadAuthor}
            postId={threadPostId}
            initialRoot={threadRoot}
          />
        }
      />
    );
  }

  if (isOverlay) {
    const threadActive = Boolean(open && threadOpen);
    const slideClass = [
      'scarce-thought-slide',
      threadActive ? 'feed-photo-slide--thread' : '',
      jacketT > 0.4 ? 'feed-photo-slide--thread-jacket' : '',
      threadDragging ? 'is-thread-dragging' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <OsMediaFaceShell
        open={open}
        onClose={() => onOpenChange(false)}
        onClosed={onClosed}
        title={name}
        quietTitle
        trailing={trailing}
        closeAriaLabel="Back"
        zIndex={faceZ}
        footer={threadActive ? null : postChrome}
        stageLayout="fixed"
        keepDock={writePinned || threadActive || dropSheetOpen}
        className={slideClass}
        contentClassName="scarce-thought-slide-body"
        bodyStyle={
          threadActive
            ? ({
                '--feed-thread-band': `${(threadBand * 100).toFixed(1)}%`,
                '--feed-jacket-t': jacketT.toFixed(3),
              } as CSSProperties)
            : undefined
        }
      >
        { }
        <div className="scarce-thought-body" onClick={handleArtTap}>
          <div className="scarce-thought-stage">{coverArt}</div>
        </div>
        {threadActive && threadAuthor && threadPostId ? (
          <div className="feed-photo-thread-host">
            <FeedMediaThreadSheet
              author={threadAuthor}
              postId={threadPostId}
              initialRoot={threadRoot}
              band={threadBand}
              gripHandlers={gripHandlers}
              onClose={dismissThread}
            />
          </div>
        ) : null}
      </OsMediaFaceShell>
    );
  }

  return null;
}
