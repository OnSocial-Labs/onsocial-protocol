'use client';

import {
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react';
import { PauseFillIcon, PlayFillIcon } from '@onsocial/ui';
import { useCollectiblesNowPlayingOptional } from '@/contexts/collectibles-now-playing-context';
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
  /**
   * When set (audio only), bind to the global Collectibles now-playing audio
   * so playback survives View drop / route changes.
   */
  persist?: { collectionId: string; title: string } | null;
}

function formatClipTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
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
  persist = null,
}: ScarceClipPlayerProps) {
  const nowPlaying = useCollectiblesNowPlayingOptional();
  const playlist =
    tracks && tracks.length > 0 ? tracks : ([clip] as ScarcePlayableMedia[]);
  const [activeIndex, setActiveIndex] = useState(0);
  const active = playlist[Math.min(activeIndex, playlist.length - 1)] ?? clip;
  const isAudio = isRenderablePostAudioMime(active.mime);
  const persistMode = Boolean(
    persist?.collectionId && isAudio && nowPlaying
  );
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const durationByUrlRef = useRef<Map<string, number>>(new Map());
  const scrubbingRef = useRef(false);
  const resumeAfterScrubRef = useRef(false);
  const playingRef = useRef(false);
  const durationRef = useRef(0);
  const currentTimeRef = useRef(0);
  const railRef = useRef<HTMLDivElement | null>(null);
  const elapsedRef = useRef<HTMLSpanElement | null>(null);
  const scrubInputRef = useRef<HTMLInputElement | null>(null);
  const knobPeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  /** Bump to autoplay after a track change (tap or natural advance). */
  const [autoplayNonce, setAutoplayNonce] = useState(0);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [duration, setDuration] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [knobPeek, setKnobPeek] = useState(false);
  const tracksOnly = layout === 'tracks' && isAudio;
  const activeLyrics = active.lyrics?.trim() || '';
  const hasLyrics = Boolean(activeLyrics);
  /** Keep the scrubber mounted for audio — hiding it on track change causes flicker. */
  const showProgress = isAudio;

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  const playlistKey = playlist.map((t) => t.url).join('\0');
  const ensureSession = nowPlaying?.ensureSession;
  const getAudio = nowPlaying?.getAudio;
  const setHostTrack = nowPlaying?.setTrack;
  const hostActiveIndex = nowPlaying?.activeIndex;
  const hostPlaying = nowPlaying?.playing;
  const hostHasSession = Boolean(nowPlaying?.session);

  // Register album with the global audio host (survives View drop).
  useEffect(() => {
    if (!persistMode || !persist || !ensureSession) return;
    ensureSession({
      collectionId: persist.collectionId,
      title: persist.title,
      poster: poster?.trim() || null,
      tracks: playlist,
    });
    // playlist identity is tracked via playlistKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    persistMode,
    persist?.collectionId,
    persist?.title,
    poster,
    playlistKey,
    ensureSession,
  ]);

  // Bind local mediaRef + UI to the shared <audio> element.
  useEffect(() => {
    if (!persistMode || !getAudio) return;
    const audio = getAudio();
    mediaRef.current = audio;

    const onPlay = () => {
      setPlaying(true);
      setStarted(true);
    };
    const onPause = () => {
      if (scrubbingRef.current) return;
      setPlaying(false);
    };
    const onLoaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        durationByUrlRef.current.set(audio.src, audio.duration);
        durationRef.current = audio.duration;
        setDuration(audio.duration);
      }
      if (!scrubbingRef.current) {
        paintProgress(audio.currentTime, audio.duration);
      }
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('durationchange', onLoaded);

    // Hydrate from live session (e.g. returning from View drop).
    if (hostActiveIndex != null) setActiveIndex(hostActiveIndex);
    setPlaying(Boolean(hostPlaying));
    setStarted(hostHasSession);
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      durationRef.current = audio.duration;
      setDuration(audio.duration);
    }
    paintProgress(audio.currentTime, audio.duration || durationRef.current);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('durationchange', onLoaded);
      // Keep global audio running — only detach the local ref.
      if (mediaRef.current === audio) {
        mediaRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bind once per album; hydrate via host* fields
  }, [persistMode, getAudio, persist?.collectionId]);

  // Keep track highlight in sync when the host advances on `ended`.
  useEffect(() => {
    if (!persistMode || hostActiveIndex == null) return;
    if (hostActiveIndex === activeIndex) return;
    setActiveIndex(hostActiveIndex);
    setLyricsOpen(false);
  }, [persistMode, hostActiveIndex, activeIndex]);

  // Keep play glyph in sync with the host while this surface is mounted.
  useEffect(() => {
    if (!persistMode || hostPlaying == null) return;
    setPlaying(hostPlaying);
    if (hostPlaying) setStarted(true);
  }, [persistMode, hostPlaying]);

  function clampTime(next: number): number {
    if (!Number.isFinite(next)) return 0;
    const total = durationRef.current;
    if (total <= 0) return Math.max(0, next);
    return Math.min(Math.max(next, 0), total);
  }

  /**
   * Paint playhead via DOM only — never React style props.
   * (React re-renders were overwriting rAF and causing the tick.)
   */
  function paintProgress(time: number, total = durationRef.current) {
    const p = total > 0 ? Math.min(1, Math.max(0, time / total)) : 0;
    currentTimeRef.current = time;
    railRef.current?.style.setProperty('--scarce-clip-p', p.toFixed(4));
    if (elapsedRef.current) {
      elapsedRef.current.textContent = formatClipTime(time);
    }
    const input = scrubInputRef.current;
    if (input) {
      input.value = String(time);
      input.setAttribute('aria-valuetext', formatClipTime(time));
    }
  }

  /** Map click/drag X to time using the visual rail — not native range thumb inset. */
  function timeFromClientX(clientX: number): number {
    const rail = railRef.current;
    const total = durationRef.current;
    if (!rail || total <= 0) return 0;
    const rect = rail.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * total;
  }

  function clearKnobPeekTimer() {
    if (knobPeekTimerRef.current != null) {
      clearTimeout(knobPeekTimerRef.current);
      knobPeekTimerRef.current = null;
    }
  }

  function showKnobPeek(holdMs = 1400) {
    clearKnobPeekTimer();
    setKnobPeek(true);
    knobPeekTimerRef.current = setTimeout(() => {
      setKnobPeek(false);
      knobPeekTimerRef.current = null;
    }, holdMs);
  }

  /** Preview only — never touch media.currentTime while dragging (avoids rewind audio). */
  function previewScrub(next: number) {
    paintProgress(clampTime(next));
  }

  function beginScrub() {
    if (scrubbingRef.current) return;
    scrubbingRef.current = true;
    setScrubbing(true);
    clearKnobPeekTimer();
    setKnobPeek(true);
    const media = mediaRef.current;
    const wasPlaying = Boolean(media && !media.paused);
    resumeAfterScrubRef.current = wasPlaying;
    if (media && wasPlaying) {
      media.pause();
    }
  }

  function endScrub(next?: number) {
    if (!scrubbingRef.current) return;
    const media = mediaRef.current;
    const target = clampTime(next ?? currentTimeRef.current);
    if (media) {
      media.currentTime = target;
    }
    paintProgress(target);
    scrubbingRef.current = false;
    setScrubbing(false);
    // Drop pointer focus so the knob can hide (keyboard still uses :focus-visible).
    scrubInputRef.current?.blur();
    showKnobPeek(1400);
    if (resumeAfterScrubRef.current && media) {
      resumeAfterScrubRef.current = false;
      void media
        .play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    } else {
      resumeAfterScrubRef.current = false;
    }
  }

  useEffect(() => {
    if (autoplayNonce === 0) return;
    if (persistMode && setHostTrack) {
      setHostTrack(activeIndex, true);
      return;
    }
    const media = mediaRef.current;
    if (!media) return;
    let cancelled = false;
    // Same <audio> node across tracks — force load so src swaps don't stall.
    media.load();
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
  }, [active.url, autoplayNonce, persistMode, setHostTrack, activeIndex]);

  // Smooth playhead — DOM paint only, no setState (avoids tick from re-render).
  useEffect(() => {
    if (!playing || scrubbing || !isAudio) return;
    let raf = 0;
    const tick = () => {
      const media = mediaRef.current;
      if (media && !scrubbingRef.current) {
        const total = media.duration;
        paintProgress(
          media.currentTime,
          Number.isFinite(total) && total > 0 ? total : durationRef.current
        );
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [playing, scrubbing, isAudio, active.url]);

  useEffect(() => {
    return () => {
      clearKnobPeekTimer();
    };
  }, []);

  function rememberDuration(url: string, next: number) {
    if (!Number.isFinite(next) || next <= 0) return;
    durationByUrlRef.current.set(url, next);
    durationRef.current = next;
    setDuration(next);
  }

  function onTimeUpdate(event: SyntheticEvent<HTMLMediaElement>) {
    if (scrubbingRef.current || playingRef.current) return;
    paintProgress(event.currentTarget.currentTime);
  }

  function onLoadedMetadata(event: SyntheticEvent<HTMLMediaElement>) {
    const media = event.currentTarget;
    rememberDuration(active.url, media.duration);
    if (!scrubbingRef.current) {
      paintProgress(media.currentTime, media.duration);
    }
  }

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
    const next = playlist[index];
    const cached = next ? durationByUrlRef.current.get(next.url) : undefined;
    setActiveIndex(index);
    setStarted(true);
    setPlaying(true);
    setLyricsOpen(false);
    const nextDuration = cached ?? duration;
    if (cached != null) {
      durationRef.current = cached;
      setDuration(cached);
    }
    paintProgress(0, nextDuration);
    if (persistMode && setHostTrack) {
      setHostTrack(index, true);
      return;
    }
    setAutoplayNonce((n) => n + 1);
  }

  function onEnded() {
    // Persist host advances tracks globally — avoid double-advance.
    if (persistMode) {
      setPlaying(false);
      return;
    }
    if (activeIndex < playlist.length - 1) {
      selectTrack(activeIndex + 1);
      return;
    }
    setPlaying(false);
  }

  const cover = poster?.trim() || null;
  const showTrackList = isAudio && (tracksOnly || playlist.length > 1);
  const audioMediaProps = {
    preload: 'metadata' as const,
    onEnded,
    onPause: () => {
      // Pause-for-scrub must not flip the play glyph mid-drag.
      if (scrubbingRef.current) return;
      setPlaying(false);
    },
    onPlay: () => setPlaying(true),
    onTimeUpdate,
    onLoadedMetadata,
    onDurationChange: onLoadedMetadata,
  };

  return (
    <div
      className={`scarce-clip-player-shell${
        tracksOnly ? ' scarce-clip-player-shell--tracks' : ''
      }${isAudio ? ' scarce-clip-player-shell--audio' : ''}`}
    >
      {tracksOnly ? (
        persistMode ? null : (
          <audio
            ref={(node) => {
              mediaRef.current = node;
            }}
            src={active.url}
            {...audioMediaProps}
          />
        )
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
              {persistMode ? null : (
                <audio
                  ref={(node) => {
                    mediaRef.current = node;
                  }}
                  src={active.url}
                  {...audioMediaProps}
                />
              )}
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

      {showProgress ? (
        <div className="scarce-clip-progress">
          <span
            ref={elapsedRef}
            className="scarce-clip-progress-time"
            suppressHydrationWarning
          >
            0:00
          </span>
          <div
            className={`scarce-clip-progress-track${
              scrubbing ? ' is-scrubbing' : ''
            }${knobPeek ? ' is-knob-peek' : ''}${
              duration <= 0 ? ' is-disabled' : ''
            }`}
            onPointerEnter={() => {
              clearKnobPeekTimer();
              setKnobPeek(true);
            }}
            onPointerLeave={() => {
              if (!scrubbingRef.current) showKnobPeek(1100);
            }}
          >
            <div ref={railRef} className="scarce-clip-progress-rail" aria-hidden>
              <div className="scarce-clip-progress-fill" />
              <span className="scarce-clip-progress-knob" />
            </div>
            <input
              key={active.url}
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
                if (durationRef.current <= 0) return;
                event.preventDefault();
                event.currentTarget.focus();
                event.currentTarget.setPointerCapture(event.pointerId);
                beginScrub();
                previewScrub(timeFromClientX(event.clientX));
              }}
              onPointerMove={(event) => {
                if (!scrubbingRef.current) return;
                previewScrub(timeFromClientX(event.clientX));
              }}
              onPointerUp={(event) => {
                endScrub(timeFromClientX(event.clientX));
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              onPointerCancel={(event) => {
                endScrub(timeFromClientX(event.clientX));
              }}
              onChange={(event) => {
                // Pointer scrub uses rail math; this path is keyboard / a11y.
                if (scrubbingRef.current) return;
                const media = mediaRef.current;
                const capped = clampTime(Number(event.currentTarget.value));
                if (media) media.currentTime = capped;
                paintProgress(capped);
                showKnobPeek(1100);
              }}
            />
          </div>
          <span className="scarce-clip-progress-time">
            {formatClipTime(duration)}
          </span>
        </div>
      ) : null}

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

      {hasLyrics ? (
        <div className="scarce-clip-lyrics">
          <button
            type="button"
            className={`scarce-clip-lyrics-toggle${lyricsOpen ? ' is-open' : ''}`}
            aria-expanded={lyricsOpen}
            aria-controls="scarce-clip-lyrics-panel"
            onClick={() => setLyricsOpen((open) => !open)}
          >
            {lyricsOpen ? 'Hide lyrics' : 'Lyrics'}
          </button>
          {lyricsOpen ? (
            <pre
              id="scarce-clip-lyrics-panel"
              className="scarce-clip-lyrics-body"
            >
              {activeLyrics}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
