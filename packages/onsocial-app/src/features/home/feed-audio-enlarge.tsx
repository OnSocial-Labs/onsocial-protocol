'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import type { CSSProperties } from 'react';
import type { PostRow } from '@onsocial/sdk';
import {
  NextFillIcon,
  PauseFillIcon,
  PlayFillIcon,
  PreviousFillIcon,
  ScaleUpIcon,
  ipfsImgSrcSet,
  useOsReveal,
} from '@onsocial/ui';
import { OsMediaFaceShell } from '@/components/os/os-media-face-shell';
import { useWriteDockPinned } from '@/contexts/compose-launcher-context';
import { ClipProgressTrack } from '@/features/home/feed-media-progress';
import { FeedMediaThreadSheet } from '@/features/home/feed-media-thread-sheet';
import {
  threadJacketT,
  useFeedThreadBand,
} from '@/features/home/use-feed-thread-band';
import { usePostLayerOwnerZ } from '@/features/home/post-layer-owner-z';
import { postLayerOverlayZ } from '@/lib/sheet-z';
import { mediaFacePostKey } from '@/lib/media-face-session';
import { SCARCE_HERO_WIDTHS, SQUARE_ART_SIZES } from '@/lib/hero-img-variants';

function formatFaceTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Feed audio enlarge — the same face as a video.
 * The cover is the film. Author and post sit on it. A tap hides them.
 * The bottom row is the video row, plus previous and next.
 * Open player sits where video puts full screen.
 */
export function FeedAudioEnlarge({
  open,
  onClose,
  onOpenPlayer,
  title,
  cover,
  playing,
  onTogglePlay,
  canPrev,
  canNext,
  playDisabled = false,
  duration,
  scrubbing = false,
  progressKey = '',
  onSkip,
  onScrubStart,
  onPreview,
  onCommit,
  faceRailRef,
  faceElapsedRef,
  faceScrubInputRef,
  peekIdentity = null,
  caption = null,
  captionDate = null,
  footer = null,
  trailing = null,
  threadOpen = false,
  onDismissThread,
  threadAuthor = null,
  threadPostId = null,
  threadRoot = null,
  onBeforeClose,
  onPaintedZ,
  yielded = false,
  faceOwnerId = null,
}: {
  open: boolean;
  onClose: () => void;
  onBeforeClose?: () => boolean;
  onOpenPlayer: () => void;
  title: string;
  cover: string | null;
  playing: boolean;
  onTogglePlay: () => void;
  canPrev: boolean;
  canNext: boolean;
  playDisabled?: boolean;
  duration: number;
  scrubbing?: boolean;
  progressKey?: string;
  onSkip: (delta: -1 | 1) => void;
  onScrubStart: () => void;
  onPreview: (time: number) => void;
  onCommit: (time: number) => void;
  faceRailRef: RefObject<HTMLDivElement | null>;
  faceElapsedRef: RefObject<HTMLSpanElement | null>;
  faceScrubInputRef: RefObject<HTMLInputElement | null>;
  peekIdentity?: ReactNode;
  caption?: string | null;
  captionDate?: string | null;
  footer?: ReactNode;
  trailing?: ReactNode;
  threadOpen?: boolean;
  onDismissThread?: () => void;
  threadAuthor?: string | null;
  threadPostId?: string | null;
  threadRoot?: PostRow | null;
  onPaintedZ?: (z: number) => void;
  /** The reply already on screen is this post. Keep the element, hide the film. */
  yielded?: boolean;
  /** Matches the card player. The sound element is not inside the film. */
  faceOwnerId?: string | null;
}) {
  const faceZ = postLayerOverlayZ(usePostLayerOwnerZ()).face;
  const writePinned = useWriteDockPinned();
  const [chromeVisible, setChromeVisible] = useState(true);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [captionHasMore, setCaptionHasMore] = useState(false);
  const captionText = caption?.trim() || '';
  const captionDateText = captionDate?.trim() || '';
  const hasCaption = captionText.length > 0;
  const {
    hostRef: captionHostRef,
    clipRef: captionClipRef,
    innerRef: captionInnerRef,
    resetScroll: resetCaptionScroll,
  } = useOsReveal<HTMLDivElement>();
  const captionTextRef = useRef<HTMLSpanElement>(null);
  const threadActive = Boolean(
    open && threadOpen && threadAuthor && threadPostId
  );
  const dismissThread = useCallback(() => {
    onDismissThread?.();
  }, [onDismissThread]);
  const { band, dragging, gripHandlers } = useFeedThreadBand(
    threadActive,
    dismissThread
  );
  const jacketT = threadJacketT(threadActive, band);
  const quiet = !chromeVisible && !threadActive && !captionExpanded;
  const measureCaption = useCallback(() => {
    const host = captionHostRef.current;
    const clip = captionClipRef.current;
    const inner = captionInnerRef.current;
    const text = captionTextRef.current;
    if (!host || !clip || !inner || !text) return;
    const cs = getComputedStyle(clip);
    let lineHeight = parseFloat(cs.lineHeight);
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
      lineHeight = parseFloat(cs.fontSize) * 1.5;
    }
    const twoLines = Math.ceil(lineHeight * 2);
    const textH = Math.ceil(text.getBoundingClientRect().height);
    const overflows = textH > twoLines + 1;
    /* Caption only. The date stays clipped until the text is tapped. */
    const closed = Math.max(Math.ceil(lineHeight), Math.min(textH, twoLines));
    const full = Math.ceil(inner.scrollHeight);
    const rem =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const maxOpen = Math.min(rem * 12, window.innerHeight * 0.36);
    const open = Math.max(closed, Math.min(full, maxOpen));
    host.style.setProperty('--os-reveal-closed', `${closed}px`);
    host.style.setProperty('--os-reveal-open', `${open}px`);
    setCaptionHasMore((prev) => (prev === overflows ? prev : overflows));
  }, [captionClipRef, captionHostRef, captionInnerRef]);
  const ignoreFilmDismissRef = useRef(false);

  useLayoutEffect(() => {
    if (!open || threadActive || !hasCaption) return;
    measureCaption();
  }, [
    open,
    threadActive,
    hasCaption,
    captionText,
    captionDateText,
    captionExpanded,
    measureCaption,
  ]);

  const expandCaption = useCallback(() => {
    measureCaption();
    setCaptionExpanded(true);
    setChromeVisible(true);
  }, [measureCaption]);
  const collapseCaption = useCallback(() => {
    resetCaptionScroll();
    setCaptionExpanded(false);
  }, [resetCaptionScroll]);

  /* Opening the drawer folds the caption during render, same as video.
   * The timer only swallows the pointer that opened it. */
  const [trackedThread, setTrackedThread] = useState(threadActive);
  if (threadActive !== trackedThread) {
    setTrackedThread(threadActive);
    if (threadActive) setCaptionExpanded(false);
  }
  useEffect(() => {
    if (!threadActive) {
      ignoreFilmDismissRef.current = false;
      return;
    }
    ignoreFilmDismissRef.current = true;
    const timer = window.setTimeout(() => {
      ignoreFilmDismissRef.current = false;
    }, 480);
    return () => window.clearTimeout(timer);
  }, [threadActive]);

  const handleStageTap = useCallback(() => {
    if (threadActive) {
      if (ignoreFilmDismissRef.current) return;
      dismissThread();
      return;
    }
    setChromeVisible((prev) => !prev);
  }, [dismissThread, threadActive]);

  const coverSrcSet = ipfsImgSrcSet(cover, SCARCE_HERO_WIDTHS);
  const transportNode = (
    <div
      className={`feed-photo-video-dock feed-photo-video-dock--slot${
        quiet ? ' is-chrome-quiet' : ''
      }${threadActive ? ' is-film-compact' : ''}`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <ClipProgressTrack
        railRef={faceRailRef}
        scrubRef={faceScrubInputRef}
        duration={duration}
        disabled={playDisabled}
        scrubbing={scrubbing}
        progressKey={progressKey}
        onScrubStart={onScrubStart}
        onPreview={onPreview}
        onCommit={onCommit}
      />
      <div className="feed-photo-video-controls">
        <button
          type="button"
          className="feed-photo-video-control"
          aria-label="Previous track"
          disabled={!canPrev}
          onClick={(event) => {
            event.stopPropagation();
            onSkip(-1);
          }}
        >
          <PreviousFillIcon
            className="feed-photo-video-control-icon"
            aria-hidden
          />
        </button>
        <button
          type="button"
          className="feed-photo-video-control is-play"
          aria-label={
            playDisabled ? 'Unavailable offline' : playing ? 'Pause' : 'Play'
          }
          disabled={playDisabled}
          onClick={(event) => {
            event.stopPropagation();
            onTogglePlay();
          }}
        >
          {playing ? (
            <PauseFillIcon
              className="feed-photo-video-control-icon"
              aria-hidden
            />
          ) : (
            <PlayFillIcon
              className="feed-photo-video-control-icon"
              aria-hidden
            />
          )}
        </button>
        <button
          type="button"
          className="feed-photo-video-control"
          aria-label="Next track"
          disabled={!canNext}
          onClick={(event) => {
            event.stopPropagation();
            onSkip(1);
          }}
        >
          <NextFillIcon className="feed-photo-video-control-icon" aria-hidden />
        </button>
        <p className="feed-photo-video-time">
          <span
            ref={faceElapsedRef}
            className="scarce-clip-time-elapsed"
            suppressHydrationWarning
          >
            0:00
          </span>
          <span className="scarce-clip-time-sep" aria-hidden>
            /
          </span>
          <span className="scarce-clip-time-total">
            {formatFaceTime(duration)}
          </span>
        </p>
        <div className="feed-photo-video-controls-end">
          <button
            type="button"
            className="feed-photo-video-control"
            aria-label="Open player"
            onClick={(event) => {
              event.stopPropagation();
              onOpenPlayer();
            }}
          >
            <ScaleUpIcon
              className="feed-photo-video-control-icon"
              aria-hidden
            />
          </button>
        </div>
      </div>
    </div>
  );
  const slideClass = [
    'feed-photo-slide',
    'feed-audio-face',
    threadActive ? 'feed-photo-slide--thread' : '',
    jacketT > 0.4 ? 'feed-photo-slide--thread-jacket' : '',
    dragging ? 'is-thread-dragging' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <OsMediaFaceShell
      open={open}
      onBeforeClose={onBeforeClose}
      onClose={() => {
        if (threadActive) {
          dismissThread();
          return;
        }
        onClose();
      }}
      onLeave={onClose}
      title={title}
      quietTitle
      trailing={trailing}
      closeAriaLabel="Back"
      zIndex={faceZ}
      onPaintedZ={onPaintedZ}
      yielded={yielded}
      faceOwnerId={faceOwnerId}
      mediaPostKey={
        threadAuthor && threadPostId
          ? mediaFacePostKey(threadAuthor, threadPostId)
          : null
      }
      footer={threadActive ? null : footer}
      transport={threadActive ? null : transportNode}
      stageLayout="fixed"
      chromeQuiet={quiet}
      keepDock={threadActive || writePinned}
      className={slideClass}
      contentClassName="feed-photo-slide-body"
      bodyStyle={
        threadActive
          ? ({
              '--feed-thread-band': `${(band * 100).toFixed(1)}%`,
              '--feed-jacket-t': jacketT.toFixed(3),
            } as CSSProperties)
          : undefined
      }
    >
      <div className="feed-photo-listen" onClick={handleStageTap}>
        <div className="feed-photo-stage">
          {cover ? (
            <img
              src={cover}
              srcSet={coverSrcSet}
              sizes={coverSrcSet ? SQUARE_ART_SIZES : undefined}
              alt=""
              className="feed-photo-image"
              decoding="async"
            />
          ) : (
            <div
              className="feed-photo-image feed-photo-image--empty"
              aria-hidden
            />
          )}
          {!threadActive && (peekIdentity || hasCaption || captionDateText) ? (
            <>
              {hasCaption ? (
                <button
                  type="button"
                  className={`feed-photo-caption-dim${captionExpanded ? ' is-on' : ''}`}
                  aria-label="Collapse post"
                  tabIndex={captionExpanded ? 0 : -1}
                  aria-hidden={!captionExpanded}
                  onClick={(event) => {
                    event.stopPropagation();
                    collapseCaption();
                  }}
                />
              ) : null}
              <div
                ref={captionHostRef}
                className={`feed-photo-caption os-reveal${
                  captionHasMore ? ' has-more' : ''
                }${captionExpanded ? ' is-expanded is-open' : ''}${
                  quiet ? ' is-chrome-quiet' : ''
                }`}
              >
                {peekIdentity ? (
                  <div
                    className="feed-photo-caption-identity"
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    {peekIdentity}
                  </div>
                ) : null}
                {hasCaption ? (
                  <button
                    type="button"
                    className="feed-photo-caption-body"
                    aria-expanded={captionExpanded}
                    aria-label={
                      captionExpanded ? 'Collapse caption' : 'Show full post'
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      if (captionExpanded) collapseCaption();
                      else expandCaption();
                    }}
                  >
                    <span
                      ref={captionClipRef}
                      className="feed-photo-caption-clip os-reveal-clip"
                    >
                      <span
                        ref={captionInnerRef}
                        className="feed-photo-caption-clip-inner os-reveal-inner is-capped os-stable-scroll"
                      >
                        <span
                          ref={captionTextRef}
                          className="feed-photo-caption-text"
                        >
                          {captionText}
                        </span>
                        {captionDateText ? (
                          <span className="feed-photo-caption-date">
                            {captionDateText}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="feed-photo-caption-more" aria-hidden>
                      ...
                    </span>
                  </button>
                ) : captionDateText ? (
                  <div className="feed-photo-caption-body feed-photo-caption-date-only">
                    <span className="feed-photo-caption-date">
                      {captionDateText}
                    </span>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
          {threadActive ? transportNode : null}
        </div>
      </div>
      {threadActive && threadAuthor && threadPostId ? (
        <div className="feed-photo-thread-host">
          <FeedMediaThreadSheet
            author={threadAuthor}
            postId={threadPostId}
            initialRoot={threadRoot}
            band={band}
            gripHandlers={gripHandlers}
            onClose={dismissThread}
          />
        </div>
      ) : null}
    </OsMediaFaceShell>
  );
}
