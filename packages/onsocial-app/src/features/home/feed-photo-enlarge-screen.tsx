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
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ipfsImgSrcSet,
  ipfsImgVariantUrl,
  OsIconAction,
  PauseFillIcon,
  PlayFillIcon,
  ScaleDownIcon,
  ScaleUpIcon,
  useOsReveal,
  VolumeMuteIcon,
  VolumeUpIcon,
} from '@onsocial/ui';
import type { PostRow } from '@onsocial/sdk';
import { OsMediaFaceShell } from '@/components/os/os-media-face-shell';
import { downloadIpfsMedia } from '@/lib/media-download';
import { useRegisterImmersiveChromeQuiet } from '@/contexts/dock-chrome-context';
import { FeedMediaThreadSheet } from '@/features/home/feed-media-thread-sheet';
import {
  FEED_THREAD_FULL,
  threadJacketT,
  useFeedThreadBand,
} from '@/features/home/use-feed-thread-band';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';
import {
  feedPhotoIndexFromScroll,
  feedPhotoScrollLeft,
  isRenderablePostVideo,
  stepFeedPhotoIndex,
  type PostMediaItem,
} from '@/lib/post-media';
import {
  containFitRect,
  rectFromRectLike,
  zoomRectsEqual,
  type FeedPhotoZoomOrigin,
  type FeedPhotoZoomRect,
} from '@/features/home/feed-photo-zoom';

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

/** The img the enlarge stage paints for `index` (null for video / unloaded). */
function activeStageImage(
  stage: HTMLElement,
  index: number,
  multi: boolean
): HTMLImageElement | null {
  if (multi) {
    const page = stage.querySelector('.feed-photo-track')?.children[index];
    const img = page?.querySelector('.feed-photo-image');
    return img instanceof HTMLImageElement ? img : null;
  }
  const img = stage.querySelector(':scope > .feed-photo-image');
  return img instanceof HTMLImageElement ? img : null;
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

const VIDEO_PROGRESS_STEPS = 1000;

/**
 * Feed media enlarge — photos + video in the shared media-face shell.
 * Caption is a 2-line peek on the film. Tap opens the rest in place —
 * first two lines stay put, extra lines + post date reveal 0fr → 1fr.
 * Reply opens the thread.
 * Progress is written straight to the DOM (no per-frame React render).
 */
export function FeedPhotoEnlargeScreen({
  open,
  onOpenChange,
  title,
  caption = null,
  captionDate = null,
  captionExpandLabel = 'Show full post',
  captionCollapseLabel = 'Collapse caption',
  quiet = false,
  photos,
  initialIndex = 0,
  engagement = null,
  threadOpen = false,
  onDismissThread = null,
  threadAuthor = null,
  threadPostId = null,
  threadRoot = null,
  closeAriaLabel,
  stage = null,
  mast = null,
  peekIdentity = null,
  trailing = null,
  zoomOrigin = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Full post body — film shows a 2-line peek; tap expands in place. */
  caption?: string | null;
  /** Post creation date — shown at the end of the expanded caption. */
  captionDate?: string | null;
  /** Accessible name when the caption peek can open. Posts say “Show full post”. */
  captionExpandLabel?: string;
  captionCollapseLabel?: string;
  /** Hide the visual title — picture + × only (About stills). */
  quiet?: boolean;
  /** Image and/or video items (audio excluded upstream). */
  photos: PostMediaItem[];
  initialIndex?: number;
  engagement?: ReactNode;
  /** Reply drawer open — scale the film and park transport on it. */
  threadOpen?: boolean;
  /** Tap the film / Escape / swipe the sheet — restore full enlarge. */
  onDismissThread?: (() => void) | null;
  /** Seed the in-face thread drawer (stays inside this slide-over). */
  threadAuthor?: string | null;
  threadPostId?: string | null;
  threadRoot?: PostRow | null;
  closeAriaLabel?: string;
  /** Mood / craft cover — used when there is no raster media to enlarge. */
  stage?: ReactNode;
  /** Optional face mast (article-style). Photo/video uses peekIdentity. */
  mast?: ReactNode;
  /** Avatar + name + account above the caption peek. */
  peekIdentity?: ReactNode;
  /** Jacket ⋯ — same post options drawer as the card. */
  trailing?:
    | ReactNode
    | ((helpers: { downloadCurrent: () => Promise<void> }) => ReactNode);
  /**
   * Tapped card thumbnail — flies a cover-cropped clone into the stage on
   * open and back on close (reduced motion and videos keep the plain pop).
   */
  zoomOrigin?: FeedPhotoZoomOrigin | null;
}) {
  const last = photos.length - 1;
  const [wasOpen, setWasOpen] = useState(open);
  const [index, setIndex] = useState(() => clampIndex(initialIndex, last));
  const captionText = caption?.trim() || '';
  const captionDateText = captionDate?.trim() || '';
  const hasCaption = Boolean(captionText) && !quiet;
  const captionLooksLong =
    captionText.split('\n').length > 2 || captionText.length > 72;
  const [captionMode, setCaptionMode] = useState<'peek' | 'expanded'>('peek');
  const [captionHasMore, setCaptionHasMore] = useState(captionLooksLong);
  const {
    hostRef: captionHostRef,
    clipRef: captionClipRef,
    innerRef: captionInnerRef,
    measure: measureReveal,
    resetScroll: resetCaptionScroll,
  } = useOsReveal<HTMLDivElement>();
  const captionTextRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const pathname = usePathname();
  /** Zoom-from-card flight — clone rects while the shared element travels. */
  const [zoomFlight, setZoomFlight] = useState<{
    phase: 'enter' | 'exit';
    from: FeedPhotoZoomRect;
    to: FeedPhotoZoomRect;
    fromRadius: string;
    toRadius: string;
    src: string;
  } | null>(null);
  const [zoomFlying, setZoomFlying] = useState(false);
  const zoomOriginRef = useRef<FeedPhotoZoomOrigin | null>(null);
  const zoomOriginIndexRef = useRef(0);
  const hiddenThumbRef = useRef<HTMLImageElement | null>(null);
  const zoomEnteredRef = useRef(false);
  const zoomExitedRef = useRef(false);
  /** True when this film was playing before Home was covered. */
  const wasPlayingBeforeCoverRef = useRef(false);
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
  const showStage = Boolean(stage) && photos.length === 0;
  const captionExpanded = hasCaption && captionMode === 'expanded';
  /*
   * Shared measured reveal (useOsReveal) — ease maps 1:1 to visible motion.
   * Peek = exactly 2 lines; open = full text + date, capped so long posts
   * scroll instead of covering the film.
   */
  const measureCaption = useCallback(() => {
    const rem =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const maxOpenPx = Math.min(rem * 12, window.innerHeight * 0.36);
    measureReveal({ closedLines: 2, maxOpenPx });
    const clip = captionClipRef.current;
    const text = captionTextRef.current;
    if (!clip || !text) return;
    // Closed height is the measured 2-line peek, not the live (animated) box.
    const cs = getComputedStyle(clip);
    let lineHeight = parseFloat(cs.lineHeight);
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
      lineHeight = parseFloat(cs.fontSize) * 1.5;
    }
    const peekPx = Math.ceil(lineHeight * 2);
    const next = text.scrollHeight > peekPx + 1;
    setCaptionHasMore((prev) => (prev === next ? prev : next));
  }, [measureReveal, captionClipRef]);
  const expandCaption = useCallback(() => {
    measureCaption();
    setCaptionMode('expanded');
  }, [measureCaption]);
  const collapseCaption = useCallback(() => {
    resetCaptionScroll();
    setCaptionMode('peek');
  }, [resetCaptionScroll]);
  useLayoutEffect(() => {
    if (!open || cinema || threadOpen || !hasCaption) return;
    measureCaption();
  }, [
    open,
    cinema,
    threadOpen,
    hasCaption,
    captionText,
    captionMode,
    measureCaption,
  ]);
  const chromeQuiet =
    open &&
    activeIsVideo &&
    !chromeVisible &&
    !scrubbing &&
    !captionExpanded &&
    !threadOpen;
  const onFilm = cinema || threadOpen;
  const dismissThread = useCallback(() => {
    onDismissThread?.();
  }, [onDismissThread]);
  const {
    band: threadBand,
    dragging: threadDragging,
    gripHandlers,
  } = useFeedThreadBand(Boolean(open && threadOpen), dismissThread);
  const jacketT = threadJacketT(Boolean(open && threadOpen), threadBand);
  const slideClass = [
    quiet ? 'feed-photo-slide feed-photo-slide--quiet' : 'feed-photo-slide',
    cinema ? 'feed-photo-slide--cinema' : '',
    threadOpen ? 'feed-photo-slide--thread' : '',
    jacketT > 0.4 ? 'feed-photo-slide--thread-jacket' : '',
    threadDragging ? 'is-thread-dragging' : '',
    zoomFlight?.phase === 'enter' ? 'feed-photo-slide--zoom-enter' : '',
    zoomFlight?.phase === 'exit' ? 'feed-photo-slide--zoom-exit' : '',
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
      setZoomFlight(null);
      setZoomFlying(false);
    } else {
      setCinema(false);
    }
  }

  const restoreHiddenThumb = useCallback(() => {
    const el = hiddenThumbRef.current;
    hiddenThumbRef.current = null;
    if (el) el.style.visibility = '';
  }, []);

  /* Thumbnail → stage shared-element flight (still photos, full motion). */
  useLayoutEffect(() => {
    if (!open) return;
    if (zoomEnteredRef.current) return;
    zoomEnteredRef.current = true;
    zoomOriginRef.current = zoomOrigin;
    const origin = zoomOrigin;
    if (!origin || prefersReducedMotion()) return;
    const originIndex = clampIndex(origin.mediaIndex, photos.length - 1);
    zoomOriginIndexRef.current = originIndex;
    const item = photos[originIndex];
    if (!item || isRenderablePostVideo(item)) return;
    const stage = stageRef.current;
    if (!stage) return;
    /* Re-measure post scroll-lock — the captured rect predates face layout. */
    const from = rectFromRectLike(origin.element.getBoundingClientRect());
    if (from.width < 2 || from.height < 2) return;
    hiddenThumbRef.current = origin.element;
    origin.element.style.visibility = 'hidden';
    setZoomFlight({
      phase: 'enter',
      from,
      to: containFitRect(stage.getBoundingClientRect(), origin.aspect),
      fromRadius: origin.radius,
      toRadius: '0.85rem',
      src: origin.src,
    });
    // Capture-once per open; rects re-measured fresh at each transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, zoomOrigin]);

  /*
   * Stage → thumbnail return flight. Runs at close INTENT (onBeforeClose —
   * the shell's own × / Escape only report onClose after the exit slide,
   * when the stage is gone) and again on an external open=false flip (the
   * stage still lives through the shell's closing window then). Plain fade
   * when the origin is gone.
   */
  const startZoomExit = useCallback(() => {
    if (zoomExitedRef.current) return;
    zoomExitedRef.current = true;
    const origin = zoomOriginRef.current;
    if (!origin) return;
    const originIndex = zoomOriginIndexRef.current;
    const item = photos[originIndex];
    const stage = stageRef.current;
    const canFly =
      !prefersReducedMotion() &&
      origin.element.isConnected &&
      Boolean(item) &&
      !isRenderablePostVideo(item ?? {}) &&
      index === originIndex &&
      !threadOpen &&
      !cinema &&
      Boolean(stage);
    if (!canFly || !stage) {
      restoreHiddenThumb();
      return;
    }
    const stageImg = activeStageImage(stage, originIndex, photos.length > 1);
    const imgBox = stageImg?.getBoundingClientRect();
    const from =
      imgBox && imgBox.width > 1 && imgBox.height > 1
        ? rectFromRectLike(imgBox)
        : containFitRect(stage.getBoundingClientRect(), origin.aspect);
    const to = rectFromRectLike(origin.element.getBoundingClientRect());
    if (to.width < 2 || to.height < 2) {
      restoreHiddenThumb();
      return;
    }
    setZoomFlight({
      phase: 'exit',
      from,
      to,
      fromRadius: '0.85rem',
      toRadius: origin.radius,
      src: origin.src,
    });
  }, [photos, index, threadOpen, cinema, restoreHiddenThumb]);

  useLayoutEffect(() => {
    if (open) {
      zoomExitedRef.current = false;
      return;
    }
    startZoomExit();
  }, [open, startZoomExit]);

  const handleBeforeShellClose = useCallback(() => {
    startZoomExit();
    return true;
  }, [startZoomExit]);

  /* Two frames so the start rect paints before the transition flips on. */
  useEffect(() => {
    if (!zoomFlight || zoomFlying) return;
    let second = 0;
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => setZoomFlying(true));
    });
    return () => {
      window.cancelAnimationFrame(first);
      window.cancelAnimationFrame(second);
    };
  }, [zoomFlight, zoomFlying]);

  /*
   * Flight end. Exit: restore the thumbnail and drop the clone. Enter: swap
   * to the real stage image once it can paint (1080/1920 variant may trail
   * the cached thumbnail the clone shows) — poll briefly, then force.
   */
  useEffect(() => {
    if (!zoomFlight || !zoomFlying) return;
    let poll = 0;
    const settle = window.setTimeout(
      () => {
        if (zoomFlight.phase === 'exit') {
          setZoomFlight(null);
          setZoomFlying(false);
          restoreHiddenThumb();
          return;
        }
        const trySwap = (): boolean => {
          const stage = stageRef.current;
          const img = stage
            ? activeStageImage(
                stage,
                zoomOriginIndexRef.current,
                photos.length > 1
              )
            : null;
          if (img && img.complete && img.naturalWidth > 0) {
            setZoomFlight(null);
            setZoomFlying(false);
            return true;
          }
          return false;
        };
        if (trySwap()) return;
        let tries = 0;
        poll = window.setInterval(() => {
          tries += 1;
          if (trySwap() || tries >= 12) {
            window.clearInterval(poll);
            setZoomFlight(null);
            setZoomFlying(false);
          }
        }, 120);
      },
      zoomFlight.phase === 'enter' ? 310 : 250
    );
    return () => {
      window.clearTimeout(settle);
      if (poll) window.clearInterval(poll);
    };
    // stageRef/photos.length read at settle time; refs stay current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomFlight, zoomFlying, restoreHiddenThumb]);

  /* Keep the landed clone aligned if the stage flexes (caption, resize). */
  const zoomEnterActive = Boolean(
    zoomFlight && zoomFlight.phase === 'enter'
  );
  useEffect(() => {
    if (!zoomEnterActive) return;
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const aspect = zoomOriginRef.current?.aspect;
      if (!aspect) return;
      const next = containFitRect(stage.getBoundingClientRect(), aspect);
      setZoomFlight((cur) =>
        cur && cur.phase === 'enter' && !zoomRectsEqual(cur.to, next)
          ? { ...cur, to: next }
          : cur
      );
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [zoomEnterActive]);

  /* Swiped to another photo mid-hold — the landed clone is stale; drop it. */
  useEffect(() => {
    if (zoomFlight?.phase !== 'enter') return;
    if (index === zoomOriginIndexRef.current) return;
    setZoomFlight(null);
    setZoomFlying(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  /*
   * No unmount-restore guard on purpose: every consumer unmounts the face
   * together with the card subtree that owns the thumbnail, and a detached
   * node needs no restore. A passive-effect cleanup would also fire on
   * StrictMode's mount double-invoke and undo the hide on open (dev).
   */

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

  /* Ignore the pointer that opened the drawer — footer unmounts and the
   * leftover pointerup lands on the film, which would close it instantly. */
  const ignoreFilmDismissRef = useRef(false);
  const [trackedThreadOpen, setTrackedThreadOpen] = useState(threadOpen);
  if (threadOpen !== trackedThreadOpen) {
    setTrackedThreadOpen(threadOpen);
    if (threadOpen) {
      setCaptionMode('peek');
    }
  }
  useEffect(() => {
    if (!threadOpen) {
      ignoreFilmDismissRef.current = false;
      return;
    }
    ignoreFilmDismissRef.current = true;
    const timer = window.setTimeout(() => {
      ignoreFilmDismissRef.current = false;
    }, 480);
    return () => window.clearTimeout(timer);
  }, [threadOpen]);

  /* Tap the film while the thread is open — close the drawer. Draft stays. */
  const handleStageTap = useCallback(() => {
    if (threadOpen && onDismissThread) {
      if (ignoreFilmDismissRef.current) return;
      onDismissThread();
      return;
    }
    toggleChrome();
  }, [threadOpen, onDismissThread, toggleChrome]);

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
      const next = Math.min(duration, Math.max(0, video.currentTime + delta));
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

  const downloadCurrent = useCallback(async () => {
    const item = photos[index];
    if (!item?.url) {
      throw new Error('Could not download this file.');
    }
    await downloadIpfsMedia({
      cid: item.cid,
      url: item.url,
      mime: item.mime || 'application/octet-stream',
      title,
      fallbackName: 'post',
      exportFile: true,
    });
  }, [index, photos, title]);

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
    if (threadOpen) {
      onDismissThread?.();
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
  }, [cinema, exitCinema, onDismissThread, revealChrome, threadOpen]);

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
        if (threadOpen && onDismissThread) {
          event.preventDefault();
          onDismissThread();
          return;
        }
        if (captionMode === 'expanded') {
          event.preventDefault();
          collapseCaption();
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
    cinema,
    captionMode,
    collapseCaption,
    chromeVisible,
    activeIsVideo,
    threadOpen,
    onDismissThread,
    toggleActiveVideo,
    toggleMute,
    toggleCinema,
    exitCinema,
    seekBySeconds,
    revealChrome,
  ]);

  /* Play the active video; honor mute. Silent fallback if sound autoplay blocked.
   * Home covered: stay quiet. Back onto this drawer: continue if it was playing.
   * Closing the drawer leaves it stopped. */
  useLayoutEffect(() => {
    const parked = [...videoRefs.current.values()].some((video) => {
      const session = video.closest('[data-feed-session]');
      return (
        session != null && session.getAttribute('data-feed-session') !== 'live'
      );
    });
    if (!parked) return;
    const active = videoRefs.current.get(index);
    if (active && !active.paused) wasPlayingBeforeCoverRef.current = true;
    videoRefs.current.forEach((video) => {
      video.pause();
    });
  }, [index, open, pathname]);

  useEffect(() => {
    const parked = [...videoRefs.current.values()].some((video) => {
      const session = video.closest('[data-feed-session]');
      return (
        session != null && session.getAttribute('data-feed-session') !== 'live'
      );
    });
    if (!open || parked) {
      if (parked) {
        const active = videoRefs.current.get(index);
        if (active && !active.paused) wasPlayingBeforeCoverRef.current = true;
      } else {
        wasPlayingBeforeCoverRef.current = false;
      }
      videoRefs.current.forEach((video) => {
        video.pause();
      });
      return;
    }
    if (wasPlayingBeforeCoverRef.current) {
      wasPlayingBeforeCoverRef.current = false;
      const active = videoRefs.current.get(index);
      if (active) {
        active.loop = true;
        active.muted = videoMuted;
        void active.play().catch(() => {
          setVideoPaused(true);
        });
      }
      return;
    }
    videoRefs.current.forEach((video, videoIndex) => {
      if (videoIndex === index) {
        video.loop = true;
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
  }, [open, index, pathname, videoMuted]);

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
    const onEnded = () => {
      sync();
      revealChrome();
    };
    video.addEventListener('ended', onEnded);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onCanPlay);
    return () => {
      video.removeEventListener('loadedmetadata', sync);
      video.removeEventListener('durationchange', sync);
      video.removeEventListener('play', sync);
      video.removeEventListener('pause', sync);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onCanPlay);
    };
  }, [open, index, activeIsVideo, photos, paintProgress, revealChrome]);

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

  /* Thread drawer — leave cinema so the film sits in the top band. */
  if (threadOpen && cinema) {
    setCinema(false);
  }
  useEffect(() => {
    if (!threadOpen) return;
    exitOsFullscreen();
  }, [threadOpen]);

  const showNav = photos.length > 1 && !cinema && !threadOpen;
  const showVideoChrome = chromeVisible || scrubbing;
  const playing = activeIsVideo && !videoPaused && !videoEnded;
  /* Keep transport mounted while watching. On-film (cinema / thread) it
   * stays visible; footer transport fades while chrome is quiet. */
  const transportMounted = open && activeIsVideo;
  const transportVisible = transportMounted && (threadOpen || showVideoChrome);

  /* Repaint rail/time after the transport remounts (reply cancel, cinema). */
  useLayoutEffect(() => {
    if (!transportMounted) return;
    const video = videoRefs.current.get(indexRef.current);
    if (!video) return;
    const duration = video.duration;
    if (Number.isFinite(duration) && duration > 0) {
      paintProgress(video.currentTime / duration, duration);
    }
  }, [transportMounted, cinema, threadOpen, paintProgress]);

  const videoTransport = useMemo(() => {
    if (!transportMounted) return null;
    return (
      <div
        ref={transportRef}
        className={`feed-photo-video-dock feed-photo-video-dock--slot${scrubbing ? ' is-scrubbing' : ''}${transportVisible ? '' : ' is-chrome-quiet'}${threadOpen ? ' is-film-compact' : ''}${threadOpen && !videoEnded && threadBand >= FEED_THREAD_FULL - 0.02 ? ' is-film-mini' : ''}`}
        style={{ '--feed-video-p': '0' } as CSSProperties}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="feed-photo-video-progress">
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
            <span
              ref={timeCurrentRef}
              className="scarce-clip-time-elapsed"
              suppressHydrationWarning
            >
              0:00
            </span>
            <span className="scarce-clip-time-sep" aria-hidden>
              /
            </span>
            <span className="scarce-clip-time-total">
              {formatVideoTime(videoDuration)}
            </span>
          </p>
          <div className="feed-photo-video-controls-end">
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
                <VolumeMuteIcon
                  className="feed-photo-video-control-icon"
                  aria-hidden
                />
              ) : (
                <VolumeUpIcon
                  className="feed-photo-video-control-icon"
                  aria-hidden
                />
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
      </div>
    );
  }, [
    transportMounted,
    transportVisible,
    scrubbing,
    videoDuration,
    videoEnded,
    threadOpen,
    threadBand,
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

  /* Tuck idle summon while the face is up; thread write dock wins via keepDock. */
  useRegisterImmersiveChromeQuiet(open && !threadOpen);

  const showCaptionPeek =
    !cinema && !threadOpen && (hasCaption || Boolean(peekIdentity));
  const captionNode = showCaptionPeek ? (
    <>
      {hasCaption ? (
        <button
          type="button"
          className={`feed-photo-caption-dim${captionExpanded ? ' is-on' : ''}`}
          aria-label="Collapse caption"
          tabIndex={captionExpanded ? 0 : -1}
          aria-hidden={!captionExpanded}
          onClick={(event) => {
            event.stopPropagation();
            collapseCaption();
            revealChrome();
          }}
        />
      ) : null}
      <div
        ref={captionHostRef}
        className={`feed-photo-caption os-reveal${captionHasMore ? ' has-more' : ''}${captionExpanded ? ' is-expanded is-open' : ''}${chromeQuiet ? ' is-chrome-quiet' : ''}`}
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
              captionExpanded ? captionCollapseLabel : captionExpandLabel
            }
            onClick={(event) => {
              event.stopPropagation();
              if (captionExpanded) collapseCaption();
              else expandCaption();
              revealChrome();
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
                <span ref={captionTextRef} className="feed-photo-caption-text">
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
        ) : null}
      </div>
    </>
  ) : null;

  const trailingNode =
    typeof trailing === 'function' ? trailing({ downloadCurrent }) : trailing;

  /*
   * Shared-element clone — portaled above the face (shell z + 1) so it can
   * fly over the fading chrome. Cover-cropped like the thumbnail; the box
   * morphs to the contain-fitted stage rect, ending pixel-aligned with the
   * real image it swaps with.
   */
  const zoomRect = zoomFlight ? (zoomFlying ? zoomFlight.to : zoomFlight.from) : null;
  const zoomLayer =
    zoomFlight && zoomRect && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="feed-photo-zoom-layer"
            style={{ zIndex: SCARCE_Z.listenShell + 1 }}
            aria-hidden
          >
            <div
              className="feed-photo-zoom-clone"
              style={{
                left: zoomRect.left,
                top: zoomRect.top,
                width: zoomRect.width,
                height: zoomRect.height,
                borderRadius: zoomFlying
                  ? zoomFlight.toRadius
                  : zoomFlight.fromRadius,
                transitionDuration:
                  zoomFlight.phase === 'enter' ? '300ms' : '250ms',
              }}
            >
              <img src={zoomFlight.src} alt="" draggable={false} />
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      {zoomLayer}
      <OsMediaFaceShell
      open={open}
      onClose={handleClose}
      onBeforeClose={handleBeforeShellClose}
      title={title}
      quietTitle
      mast={mast}
      trailing={trailingNode}
      closeAriaLabel={quietClose}
      zIndex={SCARCE_Z.listenShell}
      footer={onFilm ? null : engagement}
      transport={onFilm ? null : videoTransport}
      stageLayout="fixed"
      chromeQuiet={chromeQuiet}
      keepDock={threadOpen || !cinema}
      className={slideClass}
      contentClassName="feed-photo-slide-body"
      bodyStyle={
        threadOpen
          ? ({
              '--feed-thread-band': `${(threadBand * 100).toFixed(1)}%`,
              '--feed-jacket-t': jacketT.toFixed(3),
            } as CSSProperties)
          : undefined
      }
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
            <div ref={trackRef} className="feed-photo-track os-scrollbar-none">
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
                    muted={open && photoIndex === index ? videoMuted : true}
                    buffering={
                      open && photoIndex === index ? videoBuffering : false
                    }
                    onToggleChrome={
                      open && photoIndex === index ? handleStageTap : undefined
                    }
                    transport={
                      onFilm && open && photoIndex === index
                        ? videoTransport
                        : null
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
              onToggleChrome={handleStageTap}
              transport={onFilm ? videoTransport : null}
            />
          )}
          {captionNode}
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
      {open && threadOpen && threadAuthor && threadPostId ? (
        <div className="feed-photo-thread-host">
          <FeedMediaThreadSheet
            author={threadAuthor}
            postId={threadPostId}
            initialRoot={threadRoot}
            band={threadBand}
            gripHandlers={gripHandlers}
          />
        </div>
      ) : null}
      </OsMediaFaceShell>
    </>
  );
}

function FeedPhotoMediaStage({
  item,
  active,
  photoIndex,
  videoRefs,
  muted = true,
  buffering = false,
  onToggleChrome,
  transport = null,
}: {
  item: PostMediaItem | null;
  active: boolean;
  photoIndex: number;
  videoRefs: MutableRefObject<Map<number, HTMLVideoElement>>;
  muted?: boolean;
  buffering?: boolean;
  onToggleChrome?: () => void;
  transport?: ReactNode;
}) {
  if (!item) {
    return (
      <div className="feed-photo-image feed-photo-image--empty" aria-hidden />
    );
  }
  if (isRenderablePostVideo(item)) {
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
          loop
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
        {active ? transport : null}
      </div>
    );
  }
  /* Full-viewport slot — 1920 for large screens, 1080 rung covers phones.
   * Downloads keep the byte-original via item.cid/item.url (D4). */
  const stillSrcSet = ipfsImgSrcSet(item.url, [1080, 1920], item.mime);
  return (
    <img
      src={ipfsImgVariantUrl(item.url, 1920, item.mime) ?? item.url}
      srcSet={stillSrcSet}
      sizes={stillSrcSet ? '100vw' : undefined}
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
