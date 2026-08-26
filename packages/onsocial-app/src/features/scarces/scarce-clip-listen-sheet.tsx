'use client';

import { useId, type ReactNode, type RefObject } from 'react';
import {
  HeartFillIcon,
  HeartIcon,
  BookmarkFillIcon,
  BookmarkIcon,
  NextFillIcon,
  PauseFillIcon,
  PlayFillIcon,
  PreviousFillIcon,
} from '@onsocial/ui';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { ScarceClipShareButton } from '@/features/scarces/scarce-clip-share-button';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';

/**
 * Listen enlarge — same OsSlideOverScreen chrome as Read / Pass.
 * Back lives in the OS nav row, clipped to the phone card.
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
  saved = false,
  savePending = false,
  onToggleSave = null,
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
  /** Collection-level private bookmark (not track love). */
  saved?: boolean;
  savePending?: boolean;
  onToggleSave?: (() => void) | null;
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
  const lyricsId = useId();
  const showLove = Boolean(onToggleLove);
  const showShare = Boolean(shareTitle?.trim());
  const showSave = Boolean(onToggleSave);
  const showActions = showLove || showShare || showSave;
  const screenTitle = albumTitle.trim() || trackTitle.trim() || 'Listen';
  const screenSubtitle =
    trackTitle.trim() && trackTitle.trim() !== screenTitle
      ? trackTitle.trim()
      : undefined;

  return (
    <OsSlideOverScreen
      open={open}
      onClose={onClose}
      title={screenTitle}
      subtitle={screenSubtitle}
      closeAriaLabel="Back from listen"
      zIndex={SCARCE_Z.listenShell}
      className="scarce-listen-slide"
      contentClassName="scarce-listen-slide-body"
    >
      <div className={`scarce-clip-listen${lyricsOpen ? ' is-lyrics' : ''}`}>
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
            {showSave ? (
              <button
                type="button"
                className={`scarce-clip-listen-save${
                  saved ? ' is-saved' : ''
                }${savePending ? ' is-pending' : ''}`}
                aria-label={
                  saved
                    ? `Remove ${albumTitle} bookmark`
                    : `Bookmark ${albumTitle}`
                }
                aria-pressed={saved}
                disabled={savePending}
                onClick={() => onToggleSave?.()}
              >
                {saved ? (
                  <BookmarkFillIcon
                    className="scarce-clip-listen-save-icon"
                    aria-hidden
                  />
                ) : (
                  <BookmarkIcon
                    className="scarce-clip-listen-save-icon"
                    aria-hidden
                  />
                )}
              </button>
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
    </OsSlideOverScreen>
  );
}

function formatListenTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
