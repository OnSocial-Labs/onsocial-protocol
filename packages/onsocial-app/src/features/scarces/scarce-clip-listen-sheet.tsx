'use client';

import {
  useCallback,
  useId,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import type { PostRow } from '@onsocial/sdk';
import {
  HeartFillIcon,
  HeartIcon,
  BookmarkFillIcon,
  BookmarkIcon,
  NextFillIcon,
  PauseFillIcon,
  PlayFillIcon,
  PreviousFillIcon,
  ipfsImgSrcSet,
} from '@onsocial/ui';
import { OsMediaFaceShell } from '@/components/os/os-media-face-shell';
import {
  SCARCE_HERO_WIDTHS,
  SQUARE_ART_SIZES,
} from '@/lib/hero-img-variants';
import { FeedMediaThreadSheet } from '@/features/home/feed-media-thread-sheet';
import { useFeedThreadBand } from '@/features/home/use-feed-thread-band';
import { ScarceClipShareButton } from '@/features/scarces/scarce-clip-share-button';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';

/**
 * Listen enlarge — shared media-face jacket + frost footer; transport in body.
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
  keepDock = false,
  threadOpen = false,
  onDismissThread,
  threadAuthor = null,
  threadPostId = null,
  threadRoot = null,
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
  /** True only while Reply has the compose dock up. */
  keepDock?: boolean;
  /** Feed reply drawer. The track keeps playing; transport stays above it. */
  threadOpen?: boolean;
  onDismissThread?: () => void;
  threadAuthor?: string | null;
  threadPostId?: string | null;
  threadRoot?: PostRow | null;
}) {
  const lyricsId = useId();
  const showLove = Boolean(onToggleLove);
  const showShare = Boolean(shareTitle?.trim());
  const showSave = Boolean(onToggleSave);
  const showActions = showLove || showShare || showSave;
  const track = trackTitle.trim();
  const album = albumTitle.trim();
  const screenTitle = track || album || 'Listen';
  const albumLine = album && album !== screenTitle ? album : '';
  const threadActive = Boolean(threadOpen && threadAuthor && threadPostId);
  const dismissThread = useCallback(() => {
    onDismissThread?.();
  }, [onDismissThread]);
  const { band, dragging, gripHandlers } = useFeedThreadBand(
    threadActive,
    dismissThread
  );
  const requestClose = useCallback(() => {
    if (threadOpen) {
      onDismissThread?.();
      return;
    }
    onClose();
  }, [onClose, onDismissThread, threadOpen]);
  const coverSrcSet = ipfsImgSrcSet(cover, SCARCE_HERO_WIDTHS);

  return (
    <OsMediaFaceShell
      open={open}
      onClose={requestClose}
      title={screenTitle}
      closeAriaLabel="Back from listen"
      zIndex={SCARCE_Z.listenShell}
      keepDock={keepDock || threadActive}
      screenHeader
      footer={threadActive ? null : footer}
      stageLayout={threadActive ? 'fixed' : 'scroll'}
      className={`scarce-listen-slide${
        threadActive ? ' feed-photo-slide--thread' : ''
      }${dragging ? ' is-thread-dragging' : ''}`}
      contentClassName="scarce-listen-slide-body"
      bodyStyle={
        threadActive
          ? ({
              '--feed-thread-band': `${(band * 100).toFixed(1)}%`,
            } as CSSProperties)
          : undefined
      }
    >
      <div className={`scarce-clip-listen${lyricsOpen ? ' is-lyrics' : ''}`}>
        <div className="scarce-clip-listen-art">
          {cover ? (
            <img
              src={cover}
              srcSet={coverSrcSet}
              sizes={coverSrcSet ? SQUARE_ART_SIZES : undefined}
              alt=""
              className="scarce-clip-listen-cover"
              decoding="async"
            />
          ) : (
            <div
              className="scarce-clip-listen-cover scarce-clip-listen-cover--empty"
              aria-hidden
            />
          )}
          {albumLine ? (
            <p className="scarce-clip-listen-album">{albumLine}</p>
          ) : null}
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
              className="scarce-clip-transport-btn os-disabled-ink"
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
              className="scarce-clip-transport-btn os-disabled-ink scarce-clip-transport-btn--play"
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
              className="scarce-clip-transport-btn os-disabled-ink"
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

          {showActions ? (
            <div className="scarce-clip-listen-actions">
              {showLove ? (
                <button
                  type="button"
                  className={`scarce-clip-listen-love os-confirm-icon${
                    loved ? ' is-loved' : ''
                  }${lovePending ? ' is-pending' : ''}`}
                  aria-label={
                    lovePending
                      ? `Confirming love for ${trackTitle}`
                      : loved
                        ? `Unlove ${trackTitle}`
                        : `Love ${trackTitle}`
                  }
                  aria-pressed={loved}
                  aria-busy={lovePending}
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
              {showSave ? (
                <button
                  type="button"
                  className={`scarce-clip-listen-save os-confirm-icon${
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
              {showShare ? (
                <ScarceClipShareButton
                  title={shareTitle!.trim()}
                  className="scarce-clip-listen-share"
                  collectionId={shareCollectionId}
                  mediaUrl={shareMediaUrl}
                  mediumKind="audio"
                  postAfterShare
                />
              ) : null}
            </div>
          ) : null}

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
      {threadActive && threadAuthor && threadPostId ? (
        <div className="feed-photo-thread-host">
          <FeedMediaThreadSheet
            author={threadAuthor}
            postId={threadPostId}
            initialRoot={threadRoot}
            band={band}
            gripHandlers={gripHandlers}
          />
        </div>
      ) : null}
    </OsMediaFaceShell>
  );
}

function formatListenTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
