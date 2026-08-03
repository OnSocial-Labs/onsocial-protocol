'use client';

import { useEffect, useRef, useState } from 'react';
import { PauseFillIcon, PlayFillIcon } from '@onsocial/ui';
import type { ScarcePlayableMedia } from '@/features/market/market-listings';
import { isRenderablePostAudioMime } from '@/lib/post-media';

interface ScarceClipPlayerProps {
  clip: ScarcePlayableMedia;
  /** Full album / multi-clip list; defaults to `[clip]`. */
  tracks?: ScarcePlayableMedia[];
  /** Scarce cover — the still wallets render, used as the poster / art. */
  poster?: string | null;
  /**
   * `cover` (default) — poster + play control, then optional track list.
   * `tracks` — track list only (collection page under the static cover).
   */
  layout?: 'cover' | 'tracks';
}

/**
 * Cover-first player for video / audio scarces on buy / bid sheets.
 *
 * Shows the still cover with a play control. Tap to play the clip that is
 * actually being sold. Deliberately not `PostMediaBlock` — that registers
 * in the global feed one-video registry and would fight a thread underneath.
 *
 * Remount with `key={clip.url}` when the listing changes so play state
 * resets without an effect. Albums pass `tracks` for a selectable list.
 */
export function ScarceClipPlayer({
  clip,
  tracks,
  poster = null,
  layout = 'cover',
}: ScarceClipPlayerProps) {
  const playlist =
    tracks && tracks.length > 0 ? tracks : ([clip] as ScarcePlayableMedia[]);
  const [activeIndex, setActiveIndex] = useState(0);
  const active = playlist[Math.min(activeIndex, playlist.length - 1)] ?? clip;
  const isAudio = isRenderablePostAudioMime(active.mime);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  /** Bump to autoplay after a track change (tap or natural advance). */
  const [autoplayNonce, setAutoplayNonce] = useState(0);
  const tracksOnly = layout === 'tracks' && isAudio;

  useEffect(() => {
    if (autoplayNonce === 0) return;
    const media = mediaRef.current;
    if (!media) return;
    let cancelled = false;
    void media
      .play()
      .then(() => {
        if (!cancelled) setPlaying(true);
      })
      .catch(() => {
        if (!cancelled) setPlaying(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active.url, autoplayNonce]);

  async function togglePlayback() {
    const media = mediaRef.current;
    if (!media) return;
    if (playing) {
      media.pause();
      setPlaying(false);
      return;
    }
    setStarted(true);
    try {
      await media.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }

  function selectTrack(index: number) {
    if (index === activeIndex) {
      void togglePlayback();
      return;
    }
    setActiveIndex(index);
    setStarted(true);
    setPlaying(false);
    setAutoplayNonce((n) => n + 1);
  }

  function onEnded() {
    if (activeIndex < playlist.length - 1) {
      selectTrack(activeIndex + 1);
      return;
    }
    setPlaying(false);
  }

  const cover = poster?.trim() || null;
  const showTrackList = isAudio && (tracksOnly || playlist.length > 1);

  return (
    <div
      className={`scarce-clip-player-shell${
        tracksOnly ? ' scarce-clip-player-shell--tracks' : ''
      }`}
    >
      {tracksOnly ? (
        <audio
          key={active.url}
          ref={(node) => {
            mediaRef.current = node;
          }}
          src={active.url}
          preload="metadata"
          onEnded={onEnded}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
        />
      ) : (
        <div
          className={[
            'scarce-clip-player',
            isAudio ? 'scarce-clip-player--audio' : 'scarce-clip-player--video',
            playing ? 'is-playing' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {isAudio ? (
            <>
              {cover ? (
                <img className="scarce-clip-player-cover" src={cover} alt="" />
              ) : (
                <div className="scarce-clip-player-cover scarce-clip-player-cover--empty" />
              )}
              <audio
                key={active.url}
                ref={(node) => {
                  mediaRef.current = node;
                }}
                src={active.url}
                preload="metadata"
                onEnded={onEnded}
                onPause={() => setPlaying(false)}
                onPlay={() => setPlaying(true)}
              />
            </>
          ) : (
            <video
              key={active.url}
              ref={(node) => {
                mediaRef.current = node;
              }}
              className="scarce-clip-player-video"
              src={active.url}
              {...(cover ? { poster: cover } : {})}
              playsInline
              preload="metadata"
              controls={started}
              onEnded={() => setPlaying(false)}
              onPause={() => setPlaying(false)}
              onPlay={() => {
                setStarted(true);
                setPlaying(true);
              }}
            />
          )}

          {(!started || isAudio) && (
            <button
              type="button"
              className="scarce-clip-player-play"
              aria-label={playing ? 'Pause' : 'Play'}
              onClick={() => {
                void togglePlayback();
              }}
            >
              <span className="scarce-clip-player-play-icon" aria-hidden>
                {playing ? (
                  <PauseFillIcon className="scarce-clip-player-play-glyph scarce-clip-player-play-glyph--pause" />
                ) : (
                  <PlayFillIcon className="scarce-clip-player-play-glyph scarce-clip-player-play-glyph--play" />
                )}
              </span>
            </button>
          )}
        </div>
      )}

      {showTrackList ? (
        <ol className="scarce-clip-track-list" aria-label="Tracks">
          {playlist.map((track, index) => {
            const label = track.title?.trim() || `Track ${index + 1}`;
            const isActive = index === activeIndex;
            const isPlaying = isActive && playing;
            return (
              <li
                key={`${track.url}-${index}`}
                className={`scarce-clip-track${isActive ? ' is-active' : ''}${
                  isPlaying ? ' is-playing' : ''
                }`}
              >
                <button
                  type="button"
                  className={`scarce-clip-track-play${
                    isPlaying ? ' is-playing' : ''
                  }`}
                  aria-label={
                    isPlaying ? `Pause ${label}` : `Play ${label}`
                  }
                  onClick={() => {
                    selectTrack(index);
                  }}
                >
                  {isPlaying ? (
                    <PauseFillIcon className="scarce-clip-track-play-icon scarce-clip-track-play-icon--pause" />
                  ) : (
                    <PlayFillIcon className="scarce-clip-track-play-icon scarce-clip-track-play-icon--play" />
                  )}
                </button>
                <button
                  type="button"
                  className="scarce-clip-track-title"
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => {
                    selectTrack(index);
                  }}
                >
                  {index + 1}. {label}
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
