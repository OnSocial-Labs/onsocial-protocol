'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  OsIconAction,
  PauseFillIcon,
  PlayFillIcon,
  ScaleDownIcon,
  ScaleUpIcon,
} from '@onsocial/ui';
import { OsMediaFaceShell } from '@/components/os/os-media-face-shell';
import { useComposeLauncher } from '@/contexts/compose-launcher-context';
import { useRegisterImmersiveChromeQuiet } from '@/contexts/dock-chrome-context';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';
import {
  feedPhotoIndexFromScroll,
  feedPhotoScrollLeft,
  isRenderablePostVideo,
  stepFeedPhotoIndex,
  type PostMediaItem,
} from '@/lib/post-media';

function clampIndex(value: number, last: number): number {
  if (last < 0) return 0;
  if (!Number.isFinite(value)) return 0;
  return Math.min(last, Math.max(0, Math.floor(value)));
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Release OS fullscreen if we hold it (DOM only — no React state). */
function exitOsFullscreen(): void {
  if (typeof document === 'undefined') return;
  const doc = document as Document & {
    webkitFullscreenElement?: Element;
    webkitExitFullscreen?: () => Promise<void> | void;
  };
  if (!document.fullscreenElement && !doc.webkitFullscreenElement) return;
  const exit =
    document.exitFullscreen?.bind(document) ??
    doc.webkitExitFullscreen?.bind(doc);
  void Promise.resolve(exit?.()).catch(() => {
    /* ignore */
  });
}

function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type CaptionMode = 'peek' | 'expanded';

const VIDEO_PROGRESS_STEPS = 1000;

/**
 * Feed media enlarge — photos + video in the shared media-face shell.
 * Caption is bare themed text over the media bottom edge (soft bg-gradient
 * scrim, no panel); peek clamps to 2 lines, tap grows it in place.
 * Tap the media to toggle chrome (no auto-hide) — caption, footer, and
 * transport fade together. Video transport lives in the OS column footer
 * under engagement (inside the stage while cinema, so fullscreen keeps
 * controls); Reply in the engagement row swaps it for the write dock.
 * Progress is written straight to the DOM (no per-frame React render).
 */
export function FeedPhotoEnlargeScreen({
  open,
  onOpenChange,
  title,
  caption = null,
  quiet = false,
  photos,
  initialIndex = 0,
  engagement = null,
  onDismissReply = null,
  closeAriaLabel,
  stage = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Full post body for under-stage peek / expand. */
  caption?: string | null;
  /** Hide the visual title — picture + × only (About stills). */
  quiet?: boolean;
  /** Image and/or video items (audio excluded upstream). */
  photos: PostMediaItem[];
  initialIndex?: number;
  engagement?: ReactNode;
  /** Tap the media / Escape while replying — restore the transport. */
  onDismissReply?: (() => void) | null;
  closeAriaLabel?: string;
  /** Mood / craft cover — used when there is no raster media to enlarge. */
  stage?: ReactNode;
}) {
  const last = photos.length - 1;
  const [wasOpen, setWasOpen] = useState(open);
  const [index, setIndex] = useState(() => clampIndex(initialIndex, last));
  const captionText = caption?.trim() || '';
  const hasCaption = Boolean(captionText) && !quiet;
  const [captionMode, setCaptionMode] = useState<CaptionMode>('peek');
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const skipSnapRef = useRef(false);
  const prevOpenRef = useRef(open);
  const indexRef = useRef(index);
  const scrubbingRef = useRef(false);
  const progressRailRef = useRef<HTMLDivElement>(null);
  /* Progress targets — written directly, never via React state. */
  const transportRef = useRef<HTMLDivElement>(null);
  const scrubInputRef = useRef<HTMLInputElement>(null);
  const timeCurrentRef = useRef<HTMLSpanElement>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoPaused, setVideoPaused] = useState(false);
  const [videoBuffering, setVideoBuffering] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [cinema, setCinema] = useState(false);
  const quietClose =
    closeAriaLabel ?? (quiet ? 'Close photo' : 'Back from media');
  const hasVideo = photos.some((item) => isRenderablePostVideo(item));
  const activeIsVideo = isRenderablePostVideo(photos[index] ?? {});
  const compose = useComposeLauncher();
  const writing = compose?.type === 'write';
  const showStage = Boolean(stage) && photos.length === 0;
  const captionExpanded = hasCaption && captionMode === 'expanded';
  const chromeQuiet =
    open &&
    activeIsVideo &&
    !chromeVisible &&
    !scrubbing &&
    !captionExpanded &&
    !writing;
  const slideClass = [
    quiet ? 'feed-photo-slide feed-photo-slide--quiet' : 'feed-photo-slide',
    cinema ? 'feed-photo-slide--cinema' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setIndex(clampIndex(initialIndex, last));
      setCaptionMode('peek');
      setVideoMuted(false);
      setScrubbing(false);
      setCinema(false);
    } else {
      setCinema(false);
    }
  }

  /* Per-item playback state resets when the active item changes. */
  const [trackedIndex, setTrackedIndex] = useState(index);
  if (index !== trackedIndex) {
    setTrackedIndex(index);
    setChromeVisible(true);
    setVideoDuration(0);
    setVideoPaused(false);
    setVideoBuffering(false);
    setVideoEnded(false);
  }

  const goTo = useCallback(
    (next: number) => {
      const clamped = clampIndex(next, last);
      if (clamped === index) return;
      skipSnapRef.current = false;
      setIndex(clamped);
    },
    [index, last]
  );

  const revealChrome = useCallback(() => {
    setChromeVisible(true);
  }, []);

  const toggleChrome = useCallback(() => {
    setChromeVisible((prev) => !prev);
  }, []);

  /* Tap the media while replying — leave the reply (article-style, no chip).
   * Draft persists via draftKey; otherwise the tap toggles chrome. */
  const handleStageTap = useCallback(() => {
    if (writing && onDismissReply) {
      onDismissReply();
      return;
    }
    toggleChrome();
  }, [writing, onDismissReply, toggleChrome]);

  /* Paint progress to the DOM — rail fill, scrub value, a11y, time label. */
  const paintProgress = useCallback((ratio: number, duration: number) => {
    const p = clampRatio(ratio);
    transportRef.current?.style.setProperty('--feed-video-p', String(p));
    const scrub = scrubInputRef.current;
    if (scrub) {
      scrub.value = String(Math.round(p * VIDEO_PROGRESS_STEPS));
      scrub.setAttribute('aria-valuenow', String(Math.round(p * 100)));
      scrub.setAttribute(
        'aria-valuetext',
        `${formatVideoTime(p * duration)} of ${formatVideoTime(duration)}`
      );
    }
    const label = timeCurrentRef.current;
    if (label) label.textContent = formatVideoTime(p * duration);
  }, []);

  const seekVideo = useCallback(
    (ratio: number) => {
      const video = videoRefs.current.get(indexRef.current);
      if (!video) return;
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      const next = clampRatio(ratio);
      video.currentTime = next * duration;
      paintProgress(next, duration);
      setVideoDuration(duration);
    },
    [paintProgress]
  );

  const ratioFromClientX = useCallback((clientX: number) => {
    const rail = progressRailRef.current;
    if (!rail) return 0;
    const rect = rail.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return clampRatio((clientX - rect.left) / rect.width);
  }, []);

  const seekBySeconds = useCallback(
    (delta: number) => {
      const video = videoRefs.current.get(indexRef.current);
      if (!video) return;
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      const next = Math.min(
        duration,
        Math.max(0, video.currentTime + delta)
      );
      video.currentTime = next;
      paintProgress(next / duration, duration);
      setVideoDuration(duration);
      setVideoEnded(false);
      revealChrome();
    },
    [paintProgress, revealChrome]
  );

  const toggleActiveVideo = useCallback(() => {
    const video = videoRefs.current.get(indexRef.current);
    if (!video) return;
    revealChrome();
    if (video.ended || video.currentTime >= (video.duration || 0) - 0.05) {
      video.currentTime = 0;
      void video.play().catch(() => {
        /* gesture / policy */
      });
      return;
    }
    if (video.paused) {
      void video.play().catch(() => {
        /* gesture / policy */
      });
    } else {
      video.pause();
    }
  }, [revealChrome]);

  const toggleMute = useCallback(() => {
    const video = videoRefs.current.get(indexRef.current);
    setVideoMuted((prev) => {
      const next = !prev;
      if (video) video.muted = next;
      return next;
    });
    revealChrome();
  }, [revealChrome]);

  const exitCinema = useCallback(() => {
    setCinema(false);
    revealChrome();
    exitOsFullscreen();
  }, [revealChrome]);

  const toggleCinema = useCallback(() => {
    if (cinema) {
      exitCinema();
      return;
    }
    setCinema(true);
    revealChrome();
    const node = stageRef.current as
      | (HTMLDivElement & {
          webkitRequestFullscreen?: () => Promise<void> | void;
        })
      | null;
    if (!node) return;
    const req =
      node.requestFullscreen?.bind(node) ??
      node.webkitRequestFullscreen?.bind(node);
    void Promise.resolve(req?.()).catch(() => {
      /* CSS cinema still applies when Fullscreen API is blocked. */
    });
  }, [cinema, exitCinema, revealChrome]);

  const handleClose = useCallback(() => {
    if (cinema) {
      exitCinema();
    }
    onOpenChange(false);
  }, [cinema, exitCinema, onOpenChange]);

  useLayoutEffect(() => {
    indexRef.current = index;
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;
    const track = trackRef.current;
    if (!open || !track || photos.length < 2) return;
    if (!justOpened && skipSnapRef.current) {
      skipSnapRef.current = false;
      return;
    }
    skipSnapRef.current = false;
    track.scrollTo({
      left: feedPhotoScrollLeft(index, track.clientWidth),
      behavior: justOpened || prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [open, index, photos.length]);

  useEffect(() => {
    const track = trackRef.current;
    if (!open || !track || photos.length < 2) return;
    let width = track.clientWidth;
    const observer = new ResizeObserver(() => {
      const nextWidth = track.clientWidth;
      if (nextWidth === width) return;
      width = nextWidth;
      track.scrollTo({
        left: feedPhotoScrollLeft(indexRef.current, nextWidth),
        behavior: 'auto',
      });
    });
    observer.observe(track);
    return () => observer.disconnect();
  }, [open, photos.length]);

  useEffect(() => {
    const track = trackRef.current;
    if (!open || !track || photos.length < 2) return;
    const settle = () => {
      const next = feedPhotoIndexFromScroll(
        track.scrollLeft,
        track.clientWidth,
        last
      );
      skipSnapRef.current = true;
      setIndex(next);
      const left = feedPhotoScrollLeft(next, track.clientWidth);
      if (Math.abs(track.scrollLeft - left) > 1) {
        track.scrollTo({
          left,
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        });
      }
    };
    let timer = 0;
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, 90);
    };
    const onScrollEnd = () => {
      window.clearTimeout(timer);
      settle();
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    track.addEventListener('scrollend', onScrollEnd);
    return () => {
      window.clearTimeout(timer);
      track.removeEventListener('scroll', onScroll);
      track.removeEventListener('scrollend', onScrollEnd);
    };
  }, [open, photos.length, last]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      /* Never hijack typing — reply write dock, search, any editable. */
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
        )
      ) {
        return;
      }
      if (event.key === 'Escape') {
        if (writing && onDismissReply) {
          event.preventDefault();
          onDismissReply();
          return;
        }
        if (captionMode === 'expanded') {
          event.preventDefault();
          setCaptionMode('peek');
          revealChrome();
          return;
        }
        if (cinema) {
          event.preventDefault();
          exitCinema();
          return;
        }
        if (activeIsVideo && !chromeVisible) {
          event.preventDefault();
          revealChrome();
          return;
        }
      }
      if ((event.key === 'f' || event.key === 'F') && activeIsVideo) {
        event.preventDefault();
        toggleCinema();
        return;
      }
      if ((event.key === 'm' || event.key === 'M') && activeIsVideo) {
        event.preventDefault();
        toggleMute();
        return;
      }
      if (
        (event.key === ' ' || event.key === 'k' || event.key === 'K') &&
        activeIsVideo
      ) {
        event.preventDefault();
        toggleActiveVideo();
        return;
      }
      if ((event.key === 'j' || event.key === 'J') && activeIsVideo) {
        event.preventDefault();
        seekBySeconds(-10);
        return;
      }
      if ((event.key === 'l' || event.key === 'L') && activeIsVideo) {
        event.preventDefault();
        seekBySeconds(10);
        return;
      }
      if (photos.length < 2) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        revealChrome();
        goTo(stepFeedPhotoIndex(index, last, -1));
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        revealChrome();
        goTo(stepFeedPhotoIndex(index, last, 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    open,
    photos.length,
    last,
    index,
    goTo,
    captionMode,
    cinema,
    chromeVisible,
    activeIsVideo,
    writing,
    onDismissReply,
    toggleActiveVideo,
    toggleMute,
    toggleCinema,
    exitCinema,
    seekBySeconds,
    revealChrome,
  ]);

  /* Play the active video; honor mute. Silent fallback if sound autoplay blocked. */
  useEffect(() => {
    if (!open) {
      videoRefs.current.forEach((video) => {
        video.pause();
      });
      return;
    }
    videoRefs.current.forEach((video, videoIndex) => {
      if (videoIndex === index) {
        video.muted = videoMuted;
        void video.play().catch(() => {
          if (!videoMuted) {
            video.muted = true;
            setVideoMuted(true);
            void video.play().catch(() => {
              setVideoPaused(true);
            });
            return;
          }
          setVideoPaused(true);
        });
        return;
      }
      video.pause();
      video.muted = true;
    });
  }, [open, index, videoMuted]);

  /* Sync paused / buffering / ended; progress while idle. */
  useEffect(() => {
    if (!open || !activeIsVideo) return;
    const video = videoRefs.current.get(index);
    if (!video) {
      paintProgress(0, 0);
      return;
    }

    const sync = () => {
      const duration = video.duration;
      if (Number.isFinite(duration) && duration > 0) {
        setVideoDuration(duration);
        if (!scrubbingRef.current) {
          paintProgress(video.currentTime / duration, duration);
        }
      }
      setVideoPaused(video.paused);
      setVideoEnded(video.ended);
    };

    const onWaiting = () => setVideoBuffering(true);
    const onPlaying = () => {
      setVideoBuffering(false);
      sync();
    };
    const onCanPlay = () => setVideoBuffering(false);

    sync();
    video.addEventListener('loadedmetadata', sync);
    video.addEventListener('durationchange', sync);
    video.addEventListener('play', sync);
    video.addEventListener('pause', sync);
    video.addEventListener('ended', sync);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onCanPlay);
    return () => {
      video.removeEventListener('loadedmetadata', sync);
      video.removeEventListener('durationchange', sync);
      video.removeEventListener('play', sync);
      video.removeEventListener('pause', sync);
      video.removeEventListener('ended', sync);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onCanPlay);
    };
  }, [open, index, activeIsVideo, photos, paintProgress]);

  /* Frame-smooth progress while playing — DOM writes only, no re-render. */
  useEffect(() => {
    if (!open || !activeIsVideo || videoPaused || videoEnded) return;
    let raf = 0;
    const tick = () => {
      const video = videoRefs.current.get(indexRef.current);
      if (video && !scrubbingRef.current) {
        const duration = video.duration;
        if (Number.isFinite(duration) && duration > 0) {
          paintProgress(video.currentTime / duration, duration);
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [open, activeIsVideo, videoPaused, videoEnded, index, paintProgress]);

  /* Keep cinema state in sync if the user exits OS fullscreen. */
  useEffect(() => {
    if (!open) return;
    const onFs = () => {
      const active =
        document.fullscreenElement ??
        (document as { webkitFullscreenElement?: Element })
          .webkitFullscreenElement;
      if (!active && cinema) {
        setCinema(false);
        revealChrome();
      }
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener(
        'webkitfullscreenchange',
        onFs as EventListener
      );
    };
  }, [open, cinema, revealChrome]);

  /* Parent closed us while in OS fullscreen — release it (state resets in render). */
  useEffect(() => {
    if (open) return;
    exitOsFullscreen();
  }, [open]);

  const showNav = photos.length > 1 && !cinema;
  const showVideoChrome = chromeVisible || scrubbing;
  const playing = activeIsVideo && !videoPaused && !videoEnded;
  /* Keep transport mounted while watching AND while replying — the face
   * geometry (body padding, icon seat, peek) must never shift. While
   * writing it fades out and the write dock owns the same slot.
   * In cinema it moves inside the stage — fullscreen keeps its controls. */
  const transportMounted = open && activeIsVideo;
  const transportVisible = transportMounted && showVideoChrome && !writing;

  /* Repaint rail/time after the transport remounts (reply cancel, cinema). */
  useLayoutEffect(() => {
    if (!transportMounted) return;
    const video = videoRefs.current.get(indexRef.current);
    if (!video) return;
    const duration = video.duration;
    if (Number.isFinite(duration) && duration > 0) {
      paintProgress(video.currentTime / duration, duration);
    }
  }, [transportMounted, cinema, paintProgress]);

  const videoTransport = useMemo(() => {
    if (!transportMounted) return null;
    return (
      <div
        ref={transportRef}
        className={`feed-photo-video-dock feed-photo-video-dock--slot${scrubbing ? ' is-scrubbing' : ''}${transportVisible ? '' : ' is-chrome-quiet'}`}
        style={{ '--feed-video-p': '0' } as CSSProperties}
      >
        <div className="feed-photo-video-progress is-chrome-visible">
          <div
            ref={progressRailRef}
            className="feed-photo-video-progress-rail"
            aria-hidden
          >
            <div className="feed-photo-video-progress-fill" />
            <span className="feed-photo-video-progress-knob" />
          </div>
          <input
            ref={scrubInputRef}
            type="range"
            className="feed-photo-video-progress-scrub"
            min={0}
            max={VIDEO_PROGRESS_STEPS}
            step={1}
            defaultValue={0}
            aria-label="Video progress"
            aria-valuemin={0}
            aria-valuemax={100}
            disabled={videoDuration <= 0}
            onPointerDown={(event) => {
              if (videoDuration <= 0) return;
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              scrubbingRef.current = true;
              setScrubbing(true);
              revealChrome();
              seekVideo(ratioFromClientX(event.clientX));
            }}
            onPointerMove={(event) => {
              if (!scrubbingRef.current || videoDuration <= 0) return;
              seekVideo(ratioFromClientX(event.clientX));
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              scrubbingRef.current = false;
              setScrubbing(false);
              revealChrome();
            }}
            onPointerCancel={() => {
              scrubbingRef.current = false;
              setScrubbing(false);
              revealChrome();
            }}
            onChange={(event) => {
              seekVideo(Number(event.target.value) / VIDEO_PROGRESS_STEPS);
            }}
          />
        </div>
        <div className="feed-photo-video-controls">
          <button
            type="button"
            className="feed-photo-video-control"
            aria-label={videoEnded ? 'Replay' : playing ? 'Pause' : 'Play'}
            onClick={(event) => {
              event.stopPropagation();
              toggleActiveVideo();
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
          <p className="feed-photo-video-time">
            <span ref={timeCurrentRef}>0:00</span>
            <span className="feed-photo-video-time-sep" aria-hidden>
              /
            </span>
            <span>{formatVideoTime(videoDuration)}</span>
          </p>
          <button
            type="button"
            className={`feed-photo-video-control${
              videoMuted ? ' is-muted' : ''
            }`}
            aria-label={videoMuted ? 'Unmute' : 'Mute'}
            aria-pressed={videoMuted}
            onClick={(event) => {
              event.stopPropagation();
              toggleMute();
            }}
          >
            {videoMuted ? (
              <VolumeMuteGlyph className="feed-photo-video-control-icon" />
            ) : (
              <VolumeHighGlyph className="feed-photo-video-control-icon" />
            )}
          </button>
          <button
            type="button"
            className="feed-photo-video-control"
            aria-label={cinema ? 'Exit full screen' : 'Full screen'}
            aria-pressed={cinema}
            onClick={(event) => {
              event.stopPropagation();
              toggleCinema();
            }}
          >
            {cinema ? (
              <ScaleDownIcon
                className="feed-photo-video-control-icon"
                aria-hidden
              />
            ) : (
              <ScaleUpIcon
                className="feed-photo-video-control-icon"
                aria-hidden
              />
            )}
          </button>
        </div>
      </div>
    );
  }, [
    transportMounted,
    transportVisible,
    scrubbing,
    videoDuration,
    videoEnded,
    playing,
    videoMuted,
    cinema,
    seekVideo,
    ratioFromClientX,
    revealChrome,
    toggleActiveVideo,
    toggleMute,
    toggleCinema,
  ]);

  /* Tuck idle summon while the face is up; reply write dock wins via keepDock. */
  useRegisterImmersiveChromeQuiet(open && !writing);

  const captionNode =
    hasCaption && !cinema ? (
      <div
        className={`feed-photo-caption${captionExpanded ? ' is-expanded' : ''}${chromeQuiet ? ' is-chrome-quiet' : ''}`}
      >
        <button
          type="button"
          className="feed-photo-caption-dismiss"
          aria-label="Collapse caption"
          tabIndex={captionExpanded ? 0 : -1}
          aria-hidden={!captionExpanded}
          onClick={(event) => {
            event.stopPropagation();
            setCaptionMode('peek');
            revealChrome();
          }}
        />
        <button
          type="button"
          className="feed-photo-caption-body"
          aria-expanded={captionExpanded}
          aria-label={captionExpanded ? 'Collapse caption' : 'Show full post'}
          onClick={(event) => {
            event.stopPropagation();
            setCaptionMode(captionExpanded ? 'peek' : 'expanded');
            revealChrome();
          }}
        >
          <span className="feed-photo-caption-text">{captionText}</span>
        </button>
      </div>
    ) : null;

  return (
    <OsMediaFaceShell
      open={open}
      onClose={handleClose}
      title={title}
      quietTitle={quiet}
      closeAriaLabel={quietClose}
      zIndex={SCARCE_Z.listenShell}
      footer={cinema ? null : engagement}
      transport={cinema ? null : videoTransport}
      stageLayout="fixed"
      chromeQuiet={chromeQuiet}
      keepDock={writing}
      className={slideClass}
      contentClassName="feed-photo-slide-body"
    >
      <div className="feed-photo-listen">
        {/* Whole-stage tap (letterbox included): leave reply / toggle chrome. */}
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
        <div
          ref={stageRef}
          className={`feed-photo-stage${cinema ? ' is-cinema' : ''}`}
          onClick={handleStageTap}
        >
          {showStage ? (
            stage
          ) : photos.length > 1 ? (
            <div ref={trackRef} className="feed-photo-track">
              {photos.map((item, photoIndex) => (
                <div
                  key={`${item.cid ?? item.url}:${photoIndex}`}
                  className="feed-photo-page"
                >
                  <FeedPhotoMediaStage
                    item={item}
                    active={open && photoIndex === index}
                    photoIndex={photoIndex}
                    videoRefs={videoRefs}
                    muted={
                      open && photoIndex === index ? videoMuted : true
                    }
                    buffering={
                      open && photoIndex === index ? videoBuffering : false
                    }
                    ended={open && photoIndex === index ? videoEnded : false}
                    showCenterPlay={
                      open &&
                      photoIndex === index &&
                      (videoPaused || videoEnded)
                    }
                    onToggleChrome={
                      open && photoIndex === index ? handleStageTap : undefined
                    }
                    onTogglePlayback={
                      open && photoIndex === index
                        ? toggleActiveVideo
                        : undefined
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            <FeedPhotoMediaStage
              item={photos[0] ?? null}
              active={open}
              photoIndex={0}
              videoRefs={videoRefs}
              muted={videoMuted}
              buffering={videoBuffering}
              ended={videoEnded}
              showCenterPlay={videoPaused || videoEnded}
              onToggleChrome={handleStageTap}
              onTogglePlayback={toggleActiveVideo}
            />
          )}
          {captionNode}
          {cinema ? videoTransport : null}
        </div>
        {showNav ? (
          <div
            className={`feed-photo-nav${chromeQuiet ? ' is-chrome-quiet' : ''}`}
            role="group"
            aria-label={hasVideo ? 'Media' : 'Photos'}
          >
            <OsIconAction
              ariaLabel="Previous"
              className="feed-photo-nav-btn"
              disabled={index <= 0}
              onClick={() => {
                revealChrome();
                goTo(stepFeedPhotoIndex(index, last, -1));
              }}
            >
              <ChevronLeftIcon className="glass-sheet-close-icon" aria-hidden />
            </OsIconAction>
            <div className="feed-photo-dots">
              {photos.map((item, photoIndex) => (
                <button
                  key={`${item.cid ?? item.url}:${photoIndex}`}
                  type="button"
                  className={
                    photoIndex === index
                      ? 'feed-photo-dot is-current'
                      : 'feed-photo-dot'
                  }
                  aria-label={`Go to item ${photoIndex + 1} of ${photos.length}`}
                  aria-current={photoIndex === index ? 'true' : undefined}
                  onClick={() => {
                    revealChrome();
                    goTo(photoIndex);
                  }}
                />
              ))}
            </div>
            <OsIconAction
              ariaLabel="Next"
              className="feed-photo-nav-btn"
              disabled={index >= last}
              onClick={() => {
                revealChrome();
                goTo(stepFeedPhotoIndex(index, last, 1));
              }}
            >
              <ChevronRightIcon
                className="glass-sheet-close-icon"
                aria-hidden
              />
            </OsIconAction>
            <span className="sr-only" aria-live="polite">
              {index + 1} of {photos.length}
            </span>
          </div>
        ) : null}
      </div>
    </OsMediaFaceShell>
  );
}

function FeedPhotoMediaStage({
  item,
  active,
  photoIndex,
  videoRefs,
  muted = true,
  buffering = false,
  ended = false,
  showCenterPlay = false,
  onToggleChrome,
  onTogglePlayback,
}: {
  item: PostMediaItem | null;
  active: boolean;
  photoIndex: number;
  videoRefs: MutableRefObject<Map<number, HTMLVideoElement>>;
  muted?: boolean;
  buffering?: boolean;
  ended?: boolean;
  showCenterPlay?: boolean;
  onToggleChrome?: () => void;
  onTogglePlayback?: () => void;
}) {
  if (!item) {
    return (
      <div className="feed-photo-image feed-photo-image--empty" aria-hidden />
    );
  }
  if (isRenderablePostVideo(item)) {
    const showPlay = active && showCenterPlay && !buffering;
    return (
      <div className="feed-photo-video-wrap">
        <video
          ref={(node) => {
            if (node) videoRefs.current.set(photoIndex, node);
            else videoRefs.current.delete(photoIndex);
          }}
          src={item.url}
          className="feed-photo-image feed-photo-video"
          playsInline
          preload="metadata"
          muted={muted}
          onClick={(event) => {
            event.stopPropagation();
            onToggleChrome?.();
          }}
        />
        {active && buffering ? (
          <div
            className="feed-photo-video-buffer"
            aria-label="Loading"
            role="status"
          >
            <span className="feed-photo-video-buffer-spin" aria-hidden />
          </div>
        ) : null}
        {showPlay ? (
          <button
            type="button"
            className="feed-photo-video-play"
            aria-label={ended ? 'Replay' : 'Play'}
            onClick={(event) => {
              event.stopPropagation();
              onTogglePlayback?.();
            }}
          >
            <PlayFillIcon className="feed-photo-video-play-icon" aria-hidden />
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <img
      src={item.url}
      alt={item.alt?.trim() || ''}
      className="feed-photo-image"
      draggable={false}
      onClick={(event) => {
        event.stopPropagation();
        onToggleChrome?.();
      }}
    />
  );
}

/** Compact speaker glyphs — local to enlarge so we skip a ui-package churn. */
function VolumeHighGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M4.5 9.25h2.35L11 6.4v11.2l-4.15-2.85H4.5V9.25Z"
        fill="currentColor"
      />
      <path
        d="M14.2 9.1a3.4 3.4 0 0 1 0 5.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M16.55 6.85a6.1 6.1 0 0 1 0 10.3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function VolumeMuteGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M4.5 9.25h2.35L11 6.4v11.2l-4.15-2.85H4.5V9.25Z"
        fill="currentColor"
      />
      <path
        d="M15.2 10.2 19.4 14.4M19.4 10.2 15.2 14.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
