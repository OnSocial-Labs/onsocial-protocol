'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import {
  HeartFillIcon,
  HeartIcon,
  NextFillIcon,
  PauseFillIcon,
  PlayFillIcon,
  PreviousFillIcon,
  ScaleDownIcon,
} from '@onsocial/ui';
import { ScarceClipShareButton } from '@/features/scarces/scarce-clip-share-button';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { useVisualViewportSheetMetrics } from '@/hooks/use-visual-viewport-sheet';

const clientMountedSubscribe = () => () => {};
const getClientMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;
const LIGHTBOX_EXIT_MS = 180;

/**
 * Full-screen listen mode — same dark art-modal chrome as post / cover zoom,
 * not a GlassSheet drawer.
 */
export function ScarceClipListenSheet({
  open,
  onClose,
  cover,
  albumTitle,
  trackTitle,
  playing,
  hasLyrics,
  lyricsOpen,
  lyrics,
  canPrev,
  canNext,
  playDisabled,
  scrubbing,
  knobPeek,
  duration,
  elapsedRef,
  railRef,
  scrubInputRef,
  shareTitle = null,
  shareCollectionId = null,
  shareMediaUrl = null,
  loved = false,
  loveCount = 0,
  lovePending = false,
  onToggleLove = null,
  onTogglePlay,
  onSkip,
  onLyricsOpenChange,
  onScrubPointerDown,
  onScrubPointerMove,
  onScrubPointerUp,
  onScrubPointerCancel,
  onScrubChange,
  onProgressPointerEnter,
  onProgressPointerLeave,
  footer = null,
}: {
  open: boolean;
  onClose: () => void;
  cover: string | null;
  albumTitle: string;
  trackTitle: string;
  playing: boolean;
  hasLyrics: boolean;
  lyricsOpen: boolean;
  lyrics: string;
  canPrev: boolean;
  canNext: boolean;
  playDisabled: boolean;
  scrubbing: boolean;
  knobPeek: boolean;
  duration: number;
  elapsedRef: RefObject<HTMLSpanElement | null>;
  railRef: RefObject<HTMLDivElement | null>;
  scrubInputRef: RefObject<HTMLInputElement | null>;
  shareTitle?: string | null;
  shareCollectionId?: string | null;
  shareMediaUrl?: string | null;
  loved?: boolean;
  loveCount?: number;
  lovePending?: boolean;
  onToggleLove?: (() => void) | null;
  onTogglePlay: () => void;
  onSkip: (delta: -1 | 1) => void;
  onLyricsOpenChange: (open: boolean) => void;
  onScrubPointerDown: (clientX: number, rail: HTMLDivElement | null) => void;
  onScrubPointerMove: (clientX: number) => void;
  onScrubPointerUp: (clientX: number) => void;
  onScrubPointerCancel: (clientX: number) => void;
  onScrubChange: (value: number) => void;
  onProgressPointerEnter: () => void;
  onProgressPointerLeave: () => void;
  /** Optional post chrome under love/share (Mint/Buy + engagement). */
  footer?: ReactNode;
}) {
  const titleId = useId();
  const lyricsId = useId();
  const [closing, setClosing] = useState(false);
  const [entered, setEntered] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const mounted = useSyncExternalStore(
    clientMountedSubscribe,
    getClientMountedSnapshot,
    getServerMountedSnapshot
  );

  const showLove = Boolean(onToggleLove);
  const showShare = Boolean(shareTitle?.trim());
  const showActions = showLove || showShare;

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setClosing(false);
      setEntered(false);
    }
  }

  const lightboxOpen = open && !closing;
  const viewport = useVisualViewportSheetMetrics(open || closing);
  useScrollLock(lightboxOpen);

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

  const requestClose = useCallback(() => {
    setClosing(true);
    setEntered(false);
  }, []);

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => {
      setClosing(false);
      onClose();
    }, LIGHTBOX_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [closing, onClose]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, [lightboxOpen]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen, requestClose]);

  if (!mounted || (!open && !closing)) return null;

  return createPortal(
    <div
      className={`scarce-card-lightbox scarce-clip-listen-lightbox${
        entered && !closing ? ' is-open' : ''
      }${closing ? ' is-closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={lightboxStyle}
    >
      <div
        className={`scarce-clip-listen${lyricsOpen ? ' is-lyrics' : ''}`}
      >
        <p id={titleId} className="sr-only">
          {trackTitle}
        </p>

        <div className="scarce-clip-listen-art">
          {cover ? (
            <img src={cover} alt="" className="scarce-clip-listen-cover" />
          ) : (
            <div
              className="scarce-clip-listen-cover scarce-clip-listen-cover--empty"
              aria-hidden
            />
          )}
        </div>

        {showActions ? (
          <div className="scarce-clip-listen-actions">
            {showLove ? (
              <button
                type="button"
                className={`scarce-clip-listen-love${
                  loved ? ' is-loved' : ''
                }${lovePending ? ' is-pending' : ''}`}
                aria-label={
                  loved ? `Unlove ${trackTitle}` : `Love ${trackTitle}`
                }
                aria-pressed={loved}
                disabled={lovePending}
                onClick={() => onToggleLove?.()}
              >
                {loved ? (
                  <HeartFillIcon
                    className="scarce-clip-listen-love-icon"
                    aria-hidden
                  />
                ) : (
                  <HeartIcon
                    className="scarce-clip-listen-love-icon"
                    aria-hidden
                  />
                )}
                {loveCount > 0 ? (
                  <span className="scarce-clip-listen-love-count">
                    {loveCount}
                  </span>
                ) : null}
              </button>
            ) : null}
            {showShare ? (
              <ScarceClipShareButton
                title={shareTitle!.trim()}
                className="scarce-clip-listen-share"
                collectionId={shareCollectionId}
                mediaUrl={shareMediaUrl}
                mediumKind="audio"
              />
            ) : null}
          </div>
        ) : null}

        {footer ? (
          <div className="scarce-clip-listen-footer">{footer}</div>
        ) : null}

        <div className="scarce-clip-listen-copy">
          <p className="scarce-clip-listen-track">{trackTitle}</p>
          <p className="scarce-clip-listen-album">{albumTitle}</p>
        </div>

        {hasLyrics && lyricsOpen ? (
          <pre id={lyricsId} className="scarce-clip-listen-lyrics">
            {lyrics}
          </pre>
        ) : null}

        <div className="scarce-clip-listen-controls">
          <div className="scarce-clip-progress scarce-clip-progress--stacked">
            <div className="scarce-clip-progress-meta">
              <span className="scarce-clip-cover-time-pill scarce-clip-listen-time-pill">
                <span
                  ref={elapsedRef}
                  className="scarce-clip-time-elapsed"
                  suppressHydrationWarning
                >
                  0:00
                </span>
                <span className="scarce-clip-time-sep" aria-hidden>
                  /
                </span>
                <span className="scarce-clip-time-total">
                  {formatListenTime(duration)}
                </span>
              </span>
              <button
                type="button"
                className="scarce-clip-cover-expand scarce-clip-listen-contract"
                aria-label="Close listen"
                onClick={requestClose}
              >
                <ScaleDownIcon
                  className="scarce-clip-cover-expand-icon"
                  aria-hidden
                />
              </button>
            </div>
            <div
              className={`scarce-clip-progress-track${
                scrubbing ? ' is-scrubbing' : ''
              }${knobPeek ? ' is-knob-peek' : ''}${
                duration <= 0 ? ' is-disabled' : ''
              }`}
              onPointerEnter={onProgressPointerEnter}
              onPointerLeave={onProgressPointerLeave}
            >
              <div
                ref={railRef}
                className="scarce-clip-progress-rail"
                aria-hidden
              >
                <div className="scarce-clip-progress-fill" />
                <span className="scarce-clip-progress-knob" />
              </div>
              <input
                ref={scrubInputRef}
                type="range"
                className="scarce-clip-progress-scrub"
                min={0}
                max={duration > 0 ? duration : 1}
                step={0.01}
                defaultValue={0}
                disabled={duration <= 0}
                aria-label="Seek"
                onPointerDown={(event) => {
                  if (duration <= 0) return;
                  event.preventDefault();
                  event.currentTarget.focus();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  onScrubPointerDown(event.clientX, railRef.current);
                }}
                onPointerMove={(event) => {
                  onScrubPointerMove(event.clientX);
                }}
                onPointerUp={(event) => {
                  onScrubPointerUp(event.clientX);
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                }}
                onPointerCancel={(event) => {
                  onScrubPointerCancel(event.clientX);
                }}
                onChange={(event) => {
                  onScrubChange(Number(event.currentTarget.value));
                }}
              />
            </div>
          </div>

          <div className="scarce-clip-transport scarce-clip-listen-transport">
            <button
              type="button"
              className="scarce-clip-transport-btn"
              aria-label="Previous track"
              disabled={!canPrev}
              onClick={() => onSkip(-1)}
            >
              <PreviousFillIcon
                className="scarce-clip-transport-icon"
                aria-hidden
              />
            </button>
            <button
              type="button"
              className="scarce-clip-transport-btn scarce-clip-transport-btn--play"
              aria-label={
                playDisabled
                  ? 'Unavailable offline'
                  : playing
                    ? 'Pause'
                    : 'Play'
              }
              disabled={playDisabled}
              onClick={onTogglePlay}
            >
              {playing ? (
                <PauseFillIcon
                  className="scarce-clip-transport-icon scarce-clip-transport-icon--pause"
                  aria-hidden
                />
              ) : (
                <PlayFillIcon
                  className="scarce-clip-transport-icon scarce-clip-transport-icon--play"
                  aria-hidden
                />
              )}
            </button>
            <button
              type="button"
              className="scarce-clip-transport-btn"
              aria-label="Next track"
              disabled={!canNext}
              onClick={() => onSkip(1)}
            >
              <NextFillIcon
                className="scarce-clip-transport-icon"
                aria-hidden
              />
            </button>
          </div>

          {hasLyrics ? (
            <button
              type="button"
              className={`scarce-clip-lyrics-toggle${
                lyricsOpen ? ' is-open' : ''
              }`}
              aria-expanded={lyricsOpen}
              aria-controls={lyricsId}
              onClick={() => onLyricsOpenChange(!lyricsOpen)}
            >
              {lyricsOpen ? 'Hide lyrics' : 'Lyrics'}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}

function formatListenTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
