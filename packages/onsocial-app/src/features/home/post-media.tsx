'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  OsMediaDismiss,
  PauseFillIcon,
  PlayFillIcon,
  VolumeMuteIcon,
  VolumeUpIcon,
  IpfsBlurPreview,
  IpfsImg,
  ipfsImgSrcSet,
} from '@onsocial/ui';
import {
  LAUNCHER_RECLAIM_EVENT,
  startJoinedMedia,
} from '@/lib/single-media-playback';
import {
  setListVideoSound,
  usePostVideoPlayback,
  type PostVideoPlaybackMode,
} from '@/hooks/use-post-list-video';
import { shiftAppLenisScroll } from '@/lib/app-lenis-registry';
import type { PostMediaItem } from '@/lib/post-media';
import {
  collageCellStyle,
  collageHero,
  formatMediaDuration,
  isRenderablePostAudioMime,
  isRenderablePostVideoMime,
  postMediaItemRatio,
  postMediaStripClassName,
} from '@/lib/post-media';

export type PostMediaSize = 'compact' | 'page' | 'preview' | 'quote';

/**
 * `sizes` for the CDN image-variant srcSet — matched to the measured slots
 * (feed column 553 CSS px, collage cells half that, quote thumbs ~120–160).
 */
const IMG_SIZES_SINGLE = '(min-width: 640px) 553px, 100vw';
const IMG_SIZES_TILE = '(min-width: 640px) 277px, 50vw';
const IMG_SIZES_QUOTE_SINGLE = '(min-width: 640px) 160px, 28vw';
const IMG_SIZES_QUOTE_TILE = '(min-width: 640px) 120px, 20vw';

function mediaImgSizes(size: PostMediaSize, collage: boolean): string {
  if (size === 'quote') {
    return collage ? IMG_SIZES_QUOTE_TILE : IMG_SIZES_QUOTE_SINGLE;
  }
  return collage ? IMG_SIZES_TILE : IMG_SIZES_SINGLE;
}

/**
 * Bounded shimmer settle when decode events never fire (iOS metadata preload).
 * Same 8s budget as SDK `POSTER_TIMEOUT_MS` — named, not a magic inline.
 */
export const FEED_MEDIA_RESOLVE_FALLBACK_MS = 8_000;

/** Pure measured-ratio state step — safe under Strict Mode double invoke. */
export function nextMeasuredRatio(
  current: number | null,
  ratio: number
): number {
  return current != null && Math.abs(current - ratio) < 0.001 ? current : ratio;
}

export type SeatScrollAnchor =
  | { mode: 'height'; height: number }
  | { mode: 'top'; top: number };

/**
 * Capture how to hold the reader's place when a reserved seat resizes.
 * Above the viewport → pin by height; otherwise pin the tile top.
 */
export function captureSeatScrollAnchor(args: {
  tileTop: number;
  tileBottom: number;
  tileHeight: number;
  scrollerTop: number;
  scrollTop: number;
}): SeatScrollAnchor {
  if (args.tileBottom <= args.scrollerTop + 0.5) {
    return { mode: 'height', height: args.tileHeight };
  }
  return {
    mode: 'top',
    top: args.tileTop - args.scrollerTop + args.scrollTop,
  };
}

/** Scroll delta that keeps in-view content still after a seat resize. */
export function seatScrollDelta(
  anchor: SeatScrollAnchor,
  args: {
    tileTop: number;
    tileHeight: number;
    scrollerTop: number;
    scrollTop: number;
  }
): number {
  if (anchor.mode === 'height') {
    return args.tileHeight - anchor.height;
  }
  const next = args.tileTop - args.scrollerTop + args.scrollTop;
  return next - anchor.top;
}

/**
 * Open / focused / quote single seat. Persisted hints, a session-cached
 * feed measure, or loadedmetadata set the real ratio. Unknown returns null
 * so the seat stays main-like (`auto`) instead of locking 4:3 then snapping.
 */
export function resolveReservedSeatAspect(
  hintWidth: number | undefined,
  hintHeight: number | undefined,
  measuredRatio: number | null
): string | null {
  const hint = postMediaItemRatio({ width: hintWidth, height: hintHeight });
  if (hint != null && hintWidth != null && hintHeight != null) {
    return `${Math.round(hintWidth)} / ${Math.round(hintHeight)}`;
  }
  if (
    measuredRatio != null &&
    Number.isFinite(measuredRatio) &&
    measuredRatio > 0
  ) {
    return String(measuredRatio);
  }
  return null;
}

/**
 * Session ratio cache — feed compact tiles learn width/height on decode but
 * keep a fixed 4:3 cover seat. Open / focused / quote singles read the same
 * url → ratio on first paint so a feed tap never flashes 4:3 then snaps.
 * Insertion-ordered Map + cap: oldest urls drop first (long-scroll bound).
 */
const FEED_MEDIA_RATIO_CACHE_LIMIT = 200;
const feedMediaMeasuredRatios = new Map<string, number>();

export function rememberFeedMediaRatio(url: string, ratio: number): void {
  if (!url || !(ratio > 0) || !Number.isFinite(ratio)) return;
  if (feedMediaMeasuredRatios.has(url)) feedMediaMeasuredRatios.delete(url);
  feedMediaMeasuredRatios.set(url, ratio);
  while (feedMediaMeasuredRatios.size > FEED_MEDIA_RATIO_CACHE_LIMIT) {
    const oldest = feedMediaMeasuredRatios.keys().next().value;
    if (oldest == null) break;
    feedMediaMeasuredRatios.delete(oldest);
  }
}

export function lookupFeedMediaRatio(url: string): number | null {
  const ratio = feedMediaMeasuredRatios.get(url);
  return ratio != null && Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

/** Test helper — drop session ratios between cases. */
export function clearFeedMediaMeasuredRatios(): void {
  feedMediaMeasuredRatios.clear();
}

/** @internal test helper — current cache size after remember/evict. */
export function feedMediaMeasuredRatioCount(): number {
  return feedMediaMeasuredRatios.size;
}

/**
 * Windowed feed lists already correct scroll via useFeedWindow anchors.
 * A second Lenis shift from a reserved seat resize double-moves the viewport.
 * Hosts set `data-feed-window` whenever windowing is on — not only when a
 * spacer has non-zero height (top of list / short lists have no spacers).
 */
export function scrollerOwnsFeedWindow(scroller: ParentNode): boolean {
  return scroller.querySelector('[data-feed-window]') != null;
}

/**
 * Survives window remount so scroll-back does not re-fade known media.
 * Insertion-ordered Set + cap — same session bound as the ratio LRU.
 */
const FEED_MEDIA_RESOLVED_SRC_LIMIT = 200;
const feedMediaResolvedSrcs = new Set<string>();

function rememberFeedMediaResolvedSrc(src: string): void {
  if (!src) return;
  if (feedMediaResolvedSrcs.has(src)) feedMediaResolvedSrcs.delete(src);
  feedMediaResolvedSrcs.add(src);
  while (feedMediaResolvedSrcs.size > FEED_MEDIA_RESOLVED_SRC_LIMIT) {
    const oldest = feedMediaResolvedSrcs.values().next().value;
    if (oldest == null) break;
    feedMediaResolvedSrcs.delete(oldest);
  }
}

/**
 * Fade a feed image or video in once it can paint. Cached files resolve on
 * bind; a session Set keeps remounts from flashing opacity 0 again.
 */
export function useFeedMediaResolved(src: string) {
  const [resolved, setResolved] = useState(() =>
    feedMediaResolvedSrcs.has(src)
  );
  const [trackedSrc, setTrackedSrc] = useState(src);
  if (trackedSrc !== src) {
    setTrackedSrc(src);
    setResolved(feedMediaResolvedSrcs.has(src));
  }
  const markResolved = useCallback(() => {
    rememberFeedMediaResolvedSrc(src);
    setResolved(true);
  }, [src]);
  const bind = useCallback(
    (node: HTMLImageElement | HTMLVideoElement | null) => {
      if (!node) return;
      if (node instanceof HTMLImageElement) {
        if (node.complete && node.naturalWidth > 0) {
          rememberFeedMediaResolvedSrc(src);
          setResolved(true);
        }
        return;
      }
      // HAVE_CURRENT_DATA. Metadata (readyState 1) is not a frame.
      if (node.readyState >= 2) {
        rememberFeedMediaResolvedSrc(src);
        setResolved(true);
      }
    },
    [src]
  );

  return { resolved, markResolved, bind };
}

/**
 * Named fallback when decode events never fire (iOS metadata preload).
 * Shared by feed tiles and quote thumbs — do not copy the timer.
 * A video with no decoded frame stays on the shimmer.
 */
export function useFeedMediaResolveFallback(
  active: boolean,
  resolved: boolean,
  markResolved: () => void,
  hasFrame?: () => boolean
) {
  useEffect(() => {
    if (!active || resolved) return;
    const timer = window.setTimeout(() => {
      // No decoded frame — leave the shimmer. iOS can still settle once
      // readyState has current data and the decode events never fired.
      if (!hasFrame?.()) return;
      markResolved();
    }, FEED_MEDIA_RESOLVE_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [active, resolved, markResolved, hasFrame]);
}

type FeedMediaVideoSettleHandlers = {
  onLoadedMetadata: (event: { currentTarget: HTMLVideoElement }) => void;
  onCanPlay: () => void;
  onLoadedData: () => void;
  onError: (event: { currentTarget: HTMLVideoElement }) => void;
};

/**
 * Settle video shimmer on a decoded frame (loadeddata / canplay) or a real
 * error. Metadata only records dimensions, unless a poster is already
 * paintable — WebKit metadata preload never reaches readyState 2.
 * A load aborted because the element detached does not mark the src resolved.
 */
export function feedMediaVideoSettleHandlers(
  markResolved: () => void,
  onDimensions?: (width: number, height: number) => void,
  posterReady = false
): FeedMediaVideoSettleHandlers {
  return {
    onLoadedMetadata: (event) => {
      const video = event.currentTarget;
      onDimensions?.(video.videoWidth, video.videoHeight);
      if (posterReady) markResolved();
    },
    onCanPlay: markResolved,
    onLoadedData: markResolved,
    onError: (event) => {
      const video = event.currentTarget;
      if (!video?.isConnected) return;
      markResolved();
    },
  };
}

/** Test helper — drop session resolve marks between cases. */
export function clearFeedMediaResolvedSrcs(): void {
  feedMediaResolvedSrcs.clear();
}

/** @internal test helper — current resolved-src cache size. */
export function feedMediaResolvedSrcCount(): number {
  return feedMediaResolvedSrcs.size;
}

/** @internal test helper — remember a resolved src (LRU). */
export function rememberFeedMediaResolvedSrcForTest(src: string): void {
  rememberFeedMediaResolvedSrc(src);
}

interface PostMediaBlockProps {
  item: PostMediaItem;
  index?: number;
  size?: PostMediaSize;
  /** Thread / detail surface — inline play, mute only. */
  focused?: boolean;
  /**
   * Muted list video in a thread. Same speaker as a detail video, so the
   * viewer can turn sound on without opening the full page.
   */
  soundControl?: boolean;
  focusedVideoMuted?: boolean;
  initialVideoTime?: number;
  resumeFocusedVideo?: boolean;
  /** Static poster only — quote insets / compose previews. */
  playbackDisabled?: boolean;
  /** List: open detail — receives the tile element for zoom-origin capture. */
  onActivate?: (tile: HTMLElement | null) => void;
  /**
   * Accessible name when the tile is the control. Omitted on detail video,
   * which already has a mute button inside the tile.
   */
  activateLabel?: string;
  onRemove?: () => void;
  /** Collage grid placement from measured aspect ratio. */
  style?: CSSProperties;
  /** Natural width / height once the file has loaded. */
  onRatio?: (ratio: number) => void;
  /** `sizes` paired with the CDN variant srcSet for this tile's slot. */
  imgSizes?: string;
  /**
   * Page / focused / quote singles — lock the real ratio once hints,
   * session cache, or loadedmetadata are known (no 4:3→snap on open).
   */
  reserveRatio?: boolean;
  /** Audio jacket tap — open the in-sheet player. */
  onAudioOpen?: () => void;
}

function audioControlLabel(item: PostMediaItem, playing: boolean): string {
  const named = item.alt?.trim();
  if (playing) return named ? `Pause ${named}` : 'Pause audio';
  return named ? `Play ${named}` : 'Play audio';
}

/**
 * Audio attachment. Feed / open post: jacket seat → immersive player.
 * Composer preview / editable: local play control so remove stays reachable.
 */
function PostAudioAttachment({
  item,
  size = 'compact',
  onRemove,
  onOpen,
}: {
  item: PostMediaItem;
  size?: PostMediaSize;
  onRemove?: () => void;
  /** Feed / detail — open the in-sheet player (cover tap). */
  onOpen?: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const title = item.alt?.trim() || 'Audio';
  const playLabel = failed
    ? 'Audio unavailable'
    : audioControlLabel(item, playing);
  const listenLabel = failed
    ? 'Audio unavailable'
    : title === 'Audio'
      ? 'Listen'
      : `Listen to ${title}`;
  const elapsed = formatMediaDuration(time) || '0:00';
  const total = duration > 0 ? formatMediaDuration(duration) : '';
  const clock = total ? `${elapsed} / ${total}` : elapsed;

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio || failed) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    void startJoinedMedia(audio, 'explicit').catch(() => {});
  };

  const engine = (
    <audio
      ref={audioRef}
      className="post-audio-engine"
      src={item.url}
      preload="metadata"
      playsInline
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={() => {
        setPlaying(false);
        setTime(0);
      }}
      onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
      onLoadedMetadata={(event) => {
        const next = event.currentTarget.duration;
        if (Number.isFinite(next)) setDuration(next);
      }}
      onDurationChange={(event) => {
        const next = event.currentTarget.duration;
        if (Number.isFinite(next)) setDuration(next);
      }}
      onError={() => setFailed(true)}
    />
  );

  if (size === 'preview') {
    return (
      <div className="post-media-tile post-media-tile--preview post-audio-preview">
        <button
          type="button"
          className="post-audio-preview-play"
          aria-label={playLabel}
          disabled={failed}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            toggle();
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {playing ? (
            <PauseFillIcon aria-hidden />
          ) : (
            <PlayFillIcon aria-hidden />
          )}
        </button>
        {engine}
        {onRemove ? (
          <OsMediaDismiss
            className="post-media-remove"
            label="Remove attached media"
            onClick={onRemove}
          />
        ) : null}
      </div>
    );
  }

  // Feed / open post — same jacket seat as Drop covers; play happens inside.
  if (!onRemove && onOpen) {
    return (
      <button
        type="button"
        className="post-audio-jacket scarce-post-preview scarce-post-preview--feed scarce-post-preview--cover"
        aria-label={listenLabel}
        disabled={failed}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!failed) onOpen();
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <span
          className="scarce-list-preview-placeholder scarce-post-preview-asset"
          aria-hidden
        />
        <span className="scarce-post-preview-play" aria-hidden>
          <PlayFillIcon />
        </span>
      </button>
    );
  }

  const rowClass = [
    'post-audio-row',
    size === 'page' ? 'post-audio-row--page' : '',
    size === 'quote' ? 'post-audio-row--quote' : '',
    onRemove ? 'has-remove' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={rowClass}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="post-audio-play"
        aria-label={playLabel}
        disabled={failed}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          toggle();
        }}
      >
        {playing ? <PauseFillIcon aria-hidden /> : <PlayFillIcon aria-hidden />}
      </button>
      <div className="post-audio-meta">
        <span className="post-audio-label">
          {failed ? 'Audio unavailable' : title}
        </span>
        <span className="post-audio-time">{clock}</span>
      </div>
      <input
        type="range"
        className="post-audio-scrub"
        min={0}
        max={duration > 0 ? duration : 0}
        step={0.1}
        value={Math.min(time, duration || 0)}
        aria-label={title === 'Audio' ? 'Audio position' : `${title} position`}
        disabled={failed || duration <= 0}
        onChange={(event) => {
          const audio = audioRef.current;
          const next = Number(event.currentTarget.value);
          if (audio && Number.isFinite(next)) {
            try {
              audio.currentTime = next;
            } catch {
              /* seek before metadata */
            }
          }
          setTime(next);
        }}
      />
      {engine}
      {onRemove ? (
        <OsMediaDismiss
          className="post-media-remove"
          label="Remove attached media"
          onClick={onRemove}
        />
      ) : null}
    </div>
  );
}

/**
 * Feed media tile — muted list autoplay for video; tap opens media-face.
 * Open-post video stays inline with mute only; tap still opens the slider.
 * Audio uses a jacket seat that opens the in-sheet player.
 */
export function PostMediaBlock(props: PostMediaBlockProps) {
  if (isRenderablePostAudioMime(props.item.mime)) {
    return (
      <PostAudioAttachment
        item={props.item}
        size={props.size}
        onRemove={props.onRemove}
        onOpen={props.onAudioOpen}
      />
    );
  }
  return <PostVisualMediaBlock {...props} />;
}

function PostVisualMediaBlock({
  item,
  index = 0,
  size = 'compact',
  focused = false,
  soundControl = false,
  focusedVideoMuted = true,
  initialVideoTime = 0,
  resumeFocusedVideo = false,
  playbackDisabled = false,
  onActivate,
  activateLabel,
  onRemove,
  style,
  onRatio,
  imgSizes,
  reserveRatio = false,
}: PostMediaBlockProps) {
  const isVideo = isRenderablePostVideoMime(item.mime);
  const playbackMode: PostVideoPlaybackMode =
    onRemove || playbackDisabled
      ? null
      : isVideo
        ? focused
          ? focusedVideoMuted
            ? 'detail-muted'
            : 'detail-unmuted'
          : 'list'
        : null;
  const { containerRef, bindVideoEl, videoPreload, videoMounted } =
    usePostVideoPlayback(
      playbackMode,
      focused
        ? { initialTime: initialVideoTime, resume: resumeFocusedVideo }
        : undefined
    );
  const isListVideo = playbackMode === 'list';
  const isDetailVideo =
    playbackMode === 'detail-muted' || playbackMode === 'detail-unmuted';
  const showSoundControl = isDetailVideo || (isListVideo && soundControl);
  const isActivatable = Boolean(onActivate) && !onRemove;
  const activateAsControl =
    isActivatable && Boolean(activateLabel) && !showSoundControl;
  const [soundOff, setSoundOff] = useState(focusedVideoMuted);
  const { resolved, markResolved, bind } = useFeedMediaResolved(item.url);
  const imgSrcSet = isVideo
    ? undefined
    : ipfsImgSrcSet(item.url, undefined, item.mime);

  useEffect(() => {
    setSoundOff(focusedVideoMuted);
  }, [focusedVideoMuted]);

  const posterReady = Boolean(item.posterUrl?.trim());
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const videoHasFrame = useCallback(
    () => posterReady || (videoElementRef.current?.readyState ?? 0) >= 2,
    [posterReady]
  );
  // iOS / low-power often skip decode events with preload=metadata — shared
  // settle handlers + named fallback (same path as quote thumbs).
  useFeedMediaResolveFallback(
    isVideo && videoMounted,
    resolved,
    markResolved,
    videoHasFrame
  );

  const [measuredRatio, setMeasuredRatio] = useState<number | null>(() =>
    lookupFeedMediaRatio(item.url)
  );
  const [ratioTrackedUrl, setRatioTrackedUrl] = useState(item.url);
  if (ratioTrackedUrl !== item.url) {
    setRatioTrackedUrl(item.url);
    setMeasuredRatio(lookupFeedMediaRatio(item.url));
  }
  const tileNodeRef = useRef<HTMLElement | null>(null);
  const seatAnchorRef = useRef<SeatScrollAnchor | null>(null);
  const mediaUrl = item.url;

  const rememberRatio = (width: number, height: number) => {
    if (!(width > 0 && height > 0)) return;
    const ratio = width / height;
    // Always cache — compact feed seats do not resize, but an open/focused
    // remount must read the learned ratio on first paint (no 4:3 flash).
    rememberFeedMediaRatio(mediaUrl, ratio);
    onRatio?.(ratio);
    if (!reserveRatio) return;
    // Same ratio → no layout effect; do not leave a stale seatAnchorRef.
    const next = nextMeasuredRatio(measuredRatio, ratio);
    if (next === measuredRatio) return;
    const tile = tileNodeRef.current;
    const scroller = tile?.closest('.os-app-screen-body');
    // Windowed lists own Lenis correction — do not dual-shift.
    if (
      tile instanceof HTMLElement &&
      scroller instanceof HTMLElement &&
      !scrollerOwnsFeedWindow(scroller)
    ) {
      const tileRect = tile.getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      seatAnchorRef.current = captureSeatScrollAnchor({
        tileTop: tileRect.top,
        tileBottom: tileRect.bottom,
        tileHeight: tile.offsetHeight,
        scrollerTop: scrollerRect.top,
        scrollTop: scroller.scrollTop,
      });
    } else {
      seatAnchorRef.current = null;
    }
    setMeasuredRatio(next);
  };

  // Soft-focus / remount: reserveRatio may flip on after the feed already
  // measured — adopt the session cache before paint without a 4:3 frame.
  useLayoutEffect(() => {
    if (!reserveRatio || measuredRatio != null) return;
    const cached = lookupFeedMediaRatio(mediaUrl);
    if (cached != null) setMeasuredRatio(cached);
  }, [reserveRatio, mediaUrl, measuredRatio]);

  // Cold unhinted: learn ratio from the on-screen element (onLoad /
  // loadedmetadata) — no off-DOM Image/video probe (duplicate network).
  // Unknown stays main-like until that decode; no height animation.

  useLayoutEffect(() => {
    const anchor = seatAnchorRef.current;
    seatAnchorRef.current = null;
    if (anchor == null) return;
    const tile = tileNodeRef.current;
    const scroller = tile?.closest('.os-app-screen-body');
    if (!(tile instanceof HTMLElement) || !(scroller instanceof HTMLElement)) {
      return;
    }
    if (scrollerOwnsFeedWindow(scroller)) return;
    const tileRect = tile.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const delta = seatScrollDelta(anchor, {
      tileTop: tileRect.top,
      tileHeight: tile.offsetHeight,
      scrollerTop: scrollerRect.top,
      scrollTop: scroller.scrollTop,
    });
    if (Math.abs(delta) > 0.5) shiftAppLenisScroll(scroller, delta);
  }, [measuredRatio]);

  const tileClassName = [
    'post-media-tile',
    `post-media-tile--${size}`,
    isActivatable ? 'is-activatable' : '',
  ]
    .filter(Boolean)
    .join(' ');
  // Page / quote / focused: real ratio once known; unknown stays main-like.
  const reservedAspect = reserveRatio
    ? resolveReservedSeatAspect(item.width, item.height, measuredRatio)
    : null;
  const tileStyle =
    reservedAspect != null
      ? ({ ...style, aspectRatio: reservedAspect } satisfies CSSProperties)
      : style;

  const bindTileNode = (node: HTMLDivElement | HTMLButtonElement | null) => {
    tileNodeRef.current = node;
    if (playbackMode) {
      containerRef.current = node instanceof HTMLDivElement ? node : null;
    }
  };
  const handleActivate = (event: {
    preventDefault(): void;
    stopPropagation(): void;
    currentTarget: unknown;
  }) => {
    event.preventDefault();
    event.stopPropagation();
    onActivate?.(
      event.currentTarget instanceof HTMLElement ? event.currentTarget : null
    );
  };
  const mediaClassName = ['post-media-element', resolved ? 'is-resolved' : '']
    .filter(Boolean)
    .join(' ');
  // Compose after spread — rememberRatio closes over tile refs; passing it
  // into the helper would read refs during render (react-hooks/refs).
  const videoSettle = feedMediaVideoSettleHandlers(
    markResolved,
    undefined,
    posterReady
  );
  useEffect(() => {
    const video = videoElementRef.current;
    if (!video || !showSoundControl) return;
    const onReclaim = () => {
      setListVideoSound(video, false);
      setSoundOff(true);
    };
    video.addEventListener(LAUNCHER_RECLAIM_EVENT, onReclaim);
    return () => video.removeEventListener(LAUNCHER_RECLAIM_EVENT, onReclaim);
  }, [showSoundControl, videoMounted]);
  const bindVideo = (node: HTMLVideoElement | null) => {
    bind(node);
    videoElementRef.current = node;
    if (node && isListVideo && soundControl && !soundOff) {
      setListVideoSound(node, true);
    }
    if (playbackMode) bindVideoEl(node);
  };
  const posterUrl = item.posterUrl?.trim() || undefined;
  const media = (
    <>
      {resolved ? null : (
        <span
          className="post-media-skeleton standing-row-shimmer"
          aria-hidden
        />
      )}
      {isVideo ? (
        posterUrl ? (
          <IpfsBlurPreview src={posterUrl} mime="image/jpeg" />
        ) : null
      ) : (
        <IpfsBlurPreview src={item.url} mime={item.mime} />
      )}
      {isVideo ? (
        // Far-off list videos unmount — the ratio-held box and poster stay,
        // so the row does not move when the decoder comes back.
        videoMounted ? (
          <video
            ref={bindVideo}
            src={item.url}
            playsInline
            muted={
              playbackDisabled ||
              (isListVideo && (!soundControl || soundOff)) ||
              (isDetailVideo && soundOff)
            }
            loop={isListVideo || isDetailVideo}
            preload={videoPreload}
            {...(posterUrl ? { poster: posterUrl } : {})}
            data-post-focus-video={isDetailVideo ? String(index) : undefined}
            {...(showSoundControl ? { 'data-os-sound-chip': '' } : {})}
            className={mediaClassName}
            {...videoSettle}
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              rememberRatio(video.videoWidth, video.videoHeight);
              videoSettle.onLoadedMetadata(event);
            }}
          />
        ) : null
      ) : (
        <IpfsImg
          ref={bind}
          src={item.url}
          srcSet={imgSrcSet}
          mime={item.mime}
          sizes={imgSrcSet ? imgSizes : undefined}
          alt={item.alt?.trim() || ''}
          className={mediaClassName}
          loading={item.url.startsWith('blob:') ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={(event) => {
            const img = event.currentTarget;
            rememberRatio(img.naturalWidth, img.naturalHeight);
            markResolved();
          }}
          onError={markResolved}
        />
      )}
      {showSoundControl ? (
        <button
          type="button"
          className={`feed-photo-video-control post-media-mute${
            soundOff ? ' is-muted' : ''
          }`}
          aria-label={soundOff ? 'Unmute' : 'Mute'}
          aria-pressed={soundOff}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const video = videoElementRef.current;
            const next = !soundOff;
            if (video) {
              video.muted = next;
              video.loop = true;
              if (isListVideo) setListVideoSound(video, !next);
              if (!next)
                void startJoinedMedia(video, 'explicit').catch(() => {});
            }
            setSoundOff(next);
          }}
        >
          {soundOff ? (
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
      ) : null}
      {onRemove ? (
        <OsMediaDismiss
          className="post-media-remove"
          label="Remove attached media"
          onClick={onRemove}
        />
      ) : null}
    </>
  );

  if (activateAsControl) {
    return (
      <button
        type="button"
        ref={bindTileNode}
        style={tileStyle}
        className={tileClassName}
        aria-label={activateLabel}
        onClick={handleActivate}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {media}
      </button>
    );
  }

  return (
    <div
      ref={bindTileNode}
      style={tileStyle}
      className={tileClassName}
      onClick={isActivatable ? handleActivate : undefined}
      onPointerDown={
        isActivatable ? (event) => event.stopPropagation() : undefined
      }
    >
      {media}
    </div>
  );
}

interface PostMediaStripProps {
  items: PostMediaItem[];
  size?: PostMediaSize;
  focused?: boolean;
  /** Thread list video — speaker chip, stays muted until the viewer taps it. */
  soundControl?: boolean;
  focusedVideoMuted?: boolean;
  resumeFocusedVideo?: boolean;
  /** Which collage/carousel tile to resume unmuted (from `?mi=`). */
  resumeMediaIndex?: number;
  /** Quote insets — static thumbs, no list autoplay. */
  playbackDisabled?: boolean;
  /** Tile tap — index plus the tile element (zoom-origin capture). */
  onActivate?: (index: number, tile: HTMLElement | null) => void;
  /** Accessible name for a single still. Detail video keeps its mute control. */
  activateLabel?: string;
  /** Audio jacket tap — open the in-sheet player. */
  onAudioOpen?: () => void;
}

/** One or more media tiles for a post card / thread root. */
export function PostMediaStrip({
  items,
  size = 'compact',
  focused = false,
  soundControl = false,
  focusedVideoMuted = true,
  resumeFocusedVideo = false,
  resumeMediaIndex = 0,
  playbackDisabled = false,
  onActivate,
  activateLabel,
  onAudioOpen,
}: PostMediaStripProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const slots = useMemo(
    () =>
      items.slice(0, 4).map((item, index) => ({
        item,
        index,
        audio: isRenderablePostAudioMime(item.mime),
      })),
    [items]
  );
  const visual = useMemo(() => slots.filter((slot) => !slot.audio), [slots]);
  const audio = useMemo(() => slots.filter((slot) => slot.audio), [slots]);
  const isCarousel = focused && visual.length > 1;
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const onRatio = useCallback((url: string, ratio: number) => {
    setRatios((current) =>
      current[url] === ratio ? current : { ...current, [url]: ratio }
    );
  }, []);
  // Measured ratios win; upload-persisted hints seed the 3-up layout so the
  // hero lands on the right cell on first paint instead of flashing over.
  const hero = collageHero(
    visual.length,
    visual.map((slot) => ratios[slot.item.url] ?? postMediaItemRatio(slot.item))
  );
  const resumeSlide = visual.findIndex(
    (slot) => slot.index === resumeMediaIndex
  );

  useEffect(() => {
    if (!isCarousel || resumeSlide < 0) return;
    const strip = stripRef.current;
    if (!strip) return;
    const slide = strip.children[resumeSlide] as HTMLElement | undefined;
    if (!slide) return;
    strip.scrollTo({ left: slide.offsetLeft, behavior: 'auto' });
  }, [isCarousel, resumeSlide]);

  if (slots.length === 0) return null;

  return (
    <>
      {visual.length > 0 ? (
        <div
          ref={stripRef}
          className={postMediaStripClassName({
            count: visual.length,
            focused,
            page: size === 'page',
            quote: size === 'quote',
            layout: hero?.mode,
          })}
        >
          {visual.map((slot, visualIndex) => (
            <PostMediaBlock
              key={`${slot.item.cid ?? slot.item.url}:${slot.index}`}
              item={slot.item}
              index={slot.index}
              size={size}
              focused={focused}
              soundControl={soundControl}
              playbackDisabled={playbackDisabled}
              focusedVideoMuted={
                resumeFocusedVideo && slot.index !== resumeMediaIndex
                  ? true
                  : focusedVideoMuted
              }
              resumeFocusedVideo={
                resumeFocusedVideo && slot.index === resumeMediaIndex
              }
              onActivate={
                onActivate ? (tile) => onActivate(slot.index, tile) : undefined
              }
              activateLabel={activateLabel}
              style={collageCellStyle(visualIndex, visual.length, hero)}
              onRatio={(ratio) => onRatio(slot.item.url, ratio)}
              imgSizes={mediaImgSizes(
                size,
                visual.length > 1 &&
                  !(hero?.mode === 'wide' && hero.index === visualIndex)
              )}
              reserveRatio={
                visual.length === 1 &&
                (size === 'page' || size === 'quote' || focused)
              }
            />
          ))}
        </div>
      ) : null}
      {audio.map((slot) => (
        <PostAudioAttachment
          key={`${slot.item.cid ?? slot.item.url}:${slot.index}`}
          item={slot.item}
          size={size}
          onOpen={onAudioOpen}
        />
      ))}
    </>
  );
}
