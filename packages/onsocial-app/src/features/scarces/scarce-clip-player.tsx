'use client';

import { useRef, useState } from 'react';
import type { ScarcePlayableMedia } from '@/features/market/market-listings';
import { isRenderablePostAudioMime } from '@/lib/post-media';

interface ScarceClipPlayerProps {
  clip: ScarcePlayableMedia;
  /** Scarce cover — the still wallets render, used as the poster / art. */
  poster?: string | null;
}

/**
 * Cover-first player for video / audio scarces on buy / bid sheets.
 *
 * Shows the still cover with a play control. Tap to play the clip that is
 * actually being sold. Deliberately not `PostMediaBlock` — that registers
 * in the global feed one-video registry and would fight a thread underneath.
 *
 * Remount with `key={clip.url}` when the listing changes so play state
 * resets without an effect.
 */
export function ScarceClipPlayer({
  clip,
  poster = null,
}: ScarceClipPlayerProps) {
  const isAudio = isRenderablePostAudioMime(clip.mime);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);

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

  const cover = poster?.trim() || null;

  return (
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
            ref={(node) => {
              mediaRef.current = node;
            }}
            src={clip.url}
            preload="metadata"
            onEnded={() => setPlaying(false)}
            onPause={() => setPlaying(false)}
            onPlay={() => setPlaying(true)}
          />
        </>
      ) : (
        <video
          ref={(node) => {
            mediaRef.current = node;
          }}
          className="scarce-clip-player-video"
          src={clip.url}
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
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="currentColor"
              >
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="currentColor"
              >
                <path d="M8 5.5v13l11-6.5L8 5.5z" />
              </svg>
            )}
          </span>
        </button>
      )}
    </div>
  );
}
