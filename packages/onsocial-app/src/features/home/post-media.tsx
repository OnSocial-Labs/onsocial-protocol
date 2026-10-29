'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  PauseFillIcon,
  PlayFillIcon,
  VolumeMuteIcon,
  VolumeUpIcon,
  ipfsImgSrcSet,
} from '@onsocial/ui';
import { startJoinedMedia } from '@/lib/single-media-playback';
import {
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
 * Fade a feed image or video in once it can paint. Cached files resolve on
 * bind so a reload does not flash the skeleton again.
 */
export function useFeedMediaResolved(src: string) {
  const [resolved, setResolved] = useState(false);
  const [trackedSrc, setTrackedSrc] = useState(src);
  if (trackedSrc !== src) {
    setTrackedSrc(src);
    setResolved(false);
  }
  const markResolved = useCallback(() => {
    setResolved(true);
  }, []);
  const bind = useCallback(
    (node: HTMLImageElement | HTMLVideoElement | null) => {
      if (!node) return;
      if (node instanceof HTMLImageElement) {
        if (node.complete && node.naturalWidth > 0) setResolved(true);
        return;
      }
      if (node.readyState >= 1) setResolved(true);
    },
    []
  );

  return { resolved, markResolved, bind };
}

interface PostMediaBlockProps {
  item: PostMediaItem;
  index?: number;
  size?: PostMediaSize;
  /** Thread / detail surface — inline play, mute only. */
  focused?: boolean;
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
   * Reserve the intrinsic box from upload-persisted width/height hints so
   * intrinsically-sized tiles (page / focused / quote singles) do not shift
   * layout when the file arrives. No hint → no reservation (legacy posts).
   */
  reserveRatio?: boolean;
}

function audioControlLabel(item: PostMediaItem, playing: boolean): string {
  const named = item.alt?.trim();
  if (playing) return named ? `Pause ${named}` : 'Pause audio';
  return named ? `Play ${named}` : 'Play audio';
}

/**
 * Audio attachment — a compact row, never a photo tile.
 * Playback joins the single-player session on an explicit tap.
 */
function PostAudioAttachment({
  item,
  size = 'compact',
  onRemove,
}: {
  item: PostMediaItem;
  size?: PostMediaSize;
  onRemove?: () => void;
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
          <button
            type="button"
            className="post-media-remove"
            onClick={onRemove}
            aria-label="Remove attached media"
          >
            ×
          </button>
        ) : null}
      </div>
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
        <button
          type="button"
          className="post-media-remove"
          onClick={onRemove}
          aria-label="Remove attached media"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

/**
 * Feed media tile — muted list autoplay for video; tap opens media-face.
 * Open-post video stays inline with mute only; tap still opens the slider.
 * Audio is a compact player, never an image.
 */
export function PostMediaBlock(props: PostMediaBlockProps) {
  if (isRenderablePostAudioMime(props.item.mime)) {
    return (
      <PostAudioAttachment
        item={props.item}
        size={props.size}
        onRemove={props.onRemove}
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
  const isActivatable = Boolean(onActivate) && !onRemove;
  const activateAsControl =
    isActivatable && Boolean(activateLabel) && !isDetailVideo;
  const [soundOff, setSoundOff] = useState(focusedVideoMuted);
  const { resolved, markResolved, bind } = useFeedMediaResolved(item.url);
  const imgSrcSet = isVideo
    ? undefined
    : ipfsImgSrcSet(item.url, undefined, item.mime);

  useEffect(() => {
    setSoundOff(focusedVideoMuted);
  }, [focusedVideoMuted]);

  const rememberRatio = (width: number, height: number) => {
    if (width > 0 && height > 0) onRatio?.(width / height);
  };

  const tileClassName = [
    'post-media-tile',
    `post-media-tile--${size}`,
    isActivatable ? 'is-activatable' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const hintRatio = postMediaItemRatio(item);
  const tileStyle =
    reserveRatio && hintRatio != null
      ? ({
          ...style,
          aspectRatio: `${Math.round(item.width!)} / ${Math.round(item.height!)}`,
        } satisfies CSSProperties)
      : style;
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
  const bindVideo = (node: HTMLVideoElement | null) => {
    bind(node);
    videoElementRef.current = node;
    if (playbackMode) bindVideoEl(node);
  };
  const media = (
    <>
      {resolved ? null : (
        <span
          className="post-media-skeleton standing-row-shimmer"
          aria-hidden
        />
      )}
      {isVideo ? (
        // Far-off list videos unmount — the ratio-held box stays, the
        // decoder and buffers go. Remounts warm up a viewport before paint.
        videoMounted ? (
          <video
            ref={bindVideo}
            src={item.url}
            playsInline
            muted={
              isListVideo || playbackDisabled || (isDetailVideo && soundOff)
            }
            loop={isListVideo || isDetailVideo}
            preload={videoPreload}
            data-post-focus-video={isDetailVideo ? String(index) : undefined}
            className={mediaClassName}
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              rememberRatio(video.videoWidth, video.videoHeight);
              markResolved();
            }}
            onError={markResolved}
          />
        ) : null
      ) : (
        <img
          ref={bind}
          src={item.url}
          srcSet={imgSrcSet}
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
      {isDetailVideo ? (
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
        <button
          type="button"
          className="post-media-remove"
          onClick={onRemove}
          aria-label="Remove attached media"
        >
          ×
        </button>
      ) : null}
    </>
  );

  if (activateAsControl) {
    return (
      <button
        type="button"
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
      ref={playbackMode ? containerRef : undefined}
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
}

/** One or more media tiles for a post card / thread root. */
export function PostMediaStrip({
  items,
  size = 'compact',
  focused = false,
  focusedVideoMuted = true,
  resumeFocusedVideo = false,
  resumeMediaIndex = 0,
  playbackDisabled = false,
  onActivate,
  activateLabel,
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
        />
      ))}
    </>
  );
}
