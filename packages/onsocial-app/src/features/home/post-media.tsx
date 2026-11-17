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
  if (measuredRatio != null && Number.isFinite(measuredRatio) && measuredRatio > 0) {
    return String(measuredRatio);
  }
  return null;
}

/**
 * Session ratio cache — feed compact tiles learn width/height on decode but
 * keep a fixed 4:3 cover seat. Open / focused / quote singles read the same
 * url → ratio on first paint so a feed tap never flashes 4:3 then snaps.
 */
const feedMediaMeasuredRatios = new Map<string, number>();

export function rememberFeedMediaRatio(url: string, ratio: number): void {
  if (!url || !(ratio > 0) || !Number.isFinite(ratio)) return;
  feedMediaMeasuredRatios.set(url, ratio);
}

export function lookupFeedMediaRatio(url: string): number | null {
  const ratio = feedMediaMeasuredRatios.get(url);
  return ratio != null && Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

/** Test helper — drop session ratios between cases. */
export function clearFeedMediaMeasuredRatios(): void {
  feedMediaMeasuredRatios.clear();
}

/** Survives window remount so scroll-back does not re-fade known media. */
const feedMediaResolvedSrcs = new Set<string>();

/**
 * Fade a feed image or video in once it can paint. Cached files resolve on
 * bind; a session Set keeps remounts from flashing opacity 0 again.
 */
export function useFeedMediaResolved(src: string) {
  const [resolved, setResolved] = useState(() => feedMediaResolvedSrcs.has(src));
  const [trackedSrc, setTrackedSrc] = useState(src);
  if (trackedSrc !== src) {
    setTrackedSrc(src);
    setResolved(feedMediaResolvedSrcs.has(src));
  }
  const markResolved = useCallback(() => {
    feedMediaResolvedSrcs.add(src);
    setResolved(true);
  }, [src]);
  const bind = useCallback(
    (node: HTMLImageElement | HTMLVideoElement | null) => {
      if (!node) return;
      if (node instanceof HTMLImageElement) {
        if (node.complete && node.naturalWidth > 0) {
          feedMediaResolvedSrcs.add(src);
          setResolved(true);
        }
        return;
      }
      if (node.readyState >= 1) {
        feedMediaResolvedSrcs.add(src);
        setResolved(true);
      }
    },
    [src]
  );

  return { resolved, markResolved, bind };
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

  // iOS / low-power often skip loadeddata with preload=metadata — settle on
  // metadata/canplay/error, and clear the shimmer after the named fallback.
  useEffect(() => {
    if (!isVideo || !videoMounted || resolved) return;
    const timer = window.setTimeout(
      markResolved,
      FEED_MEDIA_RESOLVE_FALLBACK_MS
    );
    return () => window.clearTimeout(timer);
  }, [isVideo, videoMounted, resolved, markResolved]);

  const [measuredRatio, setMeasuredRatio] = useState<number | null>(() =>
    lookupFeedMediaRatio(item.url)
  );
  const [ratioTrackedUrl, setRatioTrackedUrl] = useState(item.url);
  if (ratioTrackedUrl !== item.url) {
    setRatioTrackedUrl(item.url);
    setMeasuredRatio(lookupFeedMediaRatio(item.url));
  }
  const tileNodeRef = useRef<HTMLElement | null>(null);
  const seatAnchorScrollRef = useRef<number | null>(null);
  const mediaUrl = item.url;

  const rememberRatio = (width: number, height: number) => {
    if (!(width > 0 && height > 0)) return;
    const ratio = width / height;
    // Always cache — compact feed seats do not resize, but an open/focused
    // remount must read the learned ratio on first paint (no 4:3 flash).
    rememberFeedMediaRatio(mediaUrl, ratio);
    onRatio?.(ratio);
    if (!reserveRatio) return;
    setMeasuredRatio((current) => {
      if (current != null && Math.abs(current - ratio) < 0.001) return current;
      const tile = tileNodeRef.current;
      const scroller = tile?.closest('.os-app-screen-body');
      if (tile instanceof HTMLElement && scroller instanceof HTMLElement) {
        // Hold the reader's place when the seat grows/shrinks in view.
        seatAnchorScrollRef.current =
          tile.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop;
      } else {
        seatAnchorScrollRef.current = null;
      }
      return ratio;
    });
  };

  // Soft-focus / remount: reserveRatio may flip on after the feed already
  // measured — adopt the session cache before paint without a 4:3 frame.
  useLayoutEffect(() => {
    if (!reserveRatio || measuredRatio != null) return;
    const cached = lookupFeedMediaRatio(mediaUrl);
    if (cached != null) setMeasuredRatio(cached);
  }, [reserveRatio, mediaUrl, measuredRatio]);

  // Cold hard load — no persisted dims, no session cache. Probe off-DOM
  // (same pattern as quote duration) so metadata can win before / with the
  // on-screen <video>, then hand off scroll-anchored. No height animation.
  useEffect(() => {
    if (!reserveRatio) return;
    if (postMediaItemRatio(item) != null) return;
    if (measuredRatio != null) return;
    if (lookupFeedMediaRatio(mediaUrl) != null) return;
    let cancelled = false;
    if (isVideo) {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        if (cancelled) return;
        rememberRatio(video.videoWidth, video.videoHeight);
      };
      video.onerror = () => {
        /* leave unlocked until a later decode */
      };
      video.src = mediaUrl;
      return () => {
        cancelled = true;
        video.onloadedmetadata = null;
        video.onerror = null;
        video.removeAttribute('src');
        video.load();
      };
    }
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      rememberRatio(img.naturalWidth, img.naturalHeight);
    };
    img.src = mediaUrl;
    return () => {
      cancelled = true;
      img.onload = null;
      img.src = '';
    };
    // rememberRatio closes over reserveRatio / mediaUrl; re-run when those change.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional cold probe
  }, [reserveRatio, mediaUrl, isVideo, item.width, item.height, measuredRatio]);

  useLayoutEffect(() => {
    const anchor = seatAnchorScrollRef.current;
    seatAnchorScrollRef.current = null;
    if (anchor == null) return;
    const tile = tileNodeRef.current;
    const scroller = tile?.closest('.os-app-screen-body');
    if (!(tile instanceof HTMLElement) || !(scroller instanceof HTMLElement)) {
      return;
    }
    const next =
      tile.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop;
    const delta = next - anchor;
    if (Math.abs(delta) > 0.5) scroller.scrollTop += delta;
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
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
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
        // Far-off list videos unmount — the ratio-held box (and poster
        // stand-in) stay. Remounts warm up a viewport before paint.
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
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              rememberRatio(video.videoWidth, video.videoHeight);
              markResolved();
            }}
            onCanPlay={markResolved}
            onLoadedData={markResolved}
            onError={markResolved}
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
