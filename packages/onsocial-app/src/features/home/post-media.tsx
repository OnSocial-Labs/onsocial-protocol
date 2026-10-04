'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { VolumeMuteIcon, VolumeUpIcon } from '@onsocial/ui';
import {
  usePostVideoPlayback,
  type PostVideoPlaybackMode,
} from '@/hooks/use-post-list-video';
import type { PostMediaItem } from '@/lib/post-media';
import {
  collageCellStyle,
  collageHero,
  isRenderablePostVideoMime,
  postMediaStripClassName,
} from '@/lib/post-media';

export type PostMediaSize = 'compact' | 'page' | 'preview' | 'quote';

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
  /** List: open detail (optionally with sound for video). */
  onActivate?: () => void;
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
}

/**
 * Feed media tile — muted list autoplay for video; tap opens media-face.
 * Open-post video stays inline with mute only; tap still opens the slider.
 */
export function PostMediaBlock({
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
  const { containerRef, videoRef } = usePostVideoPlayback(
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
  const handleActivate = (event: {
    preventDefault(): void;
    stopPropagation(): void;
  }) => {
    event.preventDefault();
    event.stopPropagation();
    onActivate?.();
  };
  const media = (
    <>
      {isVideo ? (
        <video
          ref={playbackMode ? videoRef : undefined}
          src={item.url}
          playsInline
          muted={isListVideo || playbackDisabled || (isDetailVideo && soundOff)}
          loop={isListVideo || isDetailVideo}
          preload="metadata"
          data-post-focus-video={isDetailVideo ? String(index) : undefined}
          className="post-media-element"
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            rememberRatio(video.videoWidth, video.videoHeight);
          }}
        />
      ) : (
        <img
          src={item.url}
          alt={item.alt?.trim() || ''}
          className="post-media-element"
          loading={item.url.startsWith('blob:') ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={(event) => {
            const img = event.currentTarget;
            rememberRatio(img.naturalWidth, img.naturalHeight);
          }}
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
            const video = videoRef.current;
            const next = !soundOff;
            if (video) {
              video.muted = next;
              video.loop = true;
              if (!next) void video.play().catch(() => {});
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
        style={style}
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
      style={style}
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
  onActivate?: (index: number) => void;
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
  const visible = items.slice(0, 4);
  const isCarousel = focused && visible.length > 1;
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const onRatio = useCallback((url: string, ratio: number) => {
    setRatios((current) =>
      current[url] === ratio ? current : { ...current, [url]: ratio }
    );
  }, []);
  const hero = collageHero(
    visible.length,
    visible.map((item) => ratios[item.url] ?? null)
  );

  useEffect(() => {
    if (!isCarousel) return;
    const strip = stripRef.current;
    if (!strip) return;
    const slide = strip.children[resumeMediaIndex] as HTMLElement | undefined;
    if (!slide) return;
    strip.scrollTo({ left: slide.offsetLeft, behavior: 'auto' });
  }, [isCarousel, resumeMediaIndex, visible.length]);

  if (visible.length === 0) return null;

  return (
    <div
      ref={stripRef}
      className={postMediaStripClassName({
        count: visible.length,
        focused,
        page: size === 'page',
        quote: size === 'quote',
        layout: hero?.mode,
      })}
    >
      {visible.map((item, index) => (
        <PostMediaBlock
          key={`${item.cid ?? item.url}:${index}`}
          item={item}
          index={index}
          size={size}
          focused={focused}
          playbackDisabled={playbackDisabled}
          focusedVideoMuted={
            resumeFocusedVideo && index !== resumeMediaIndex
              ? true
              : focusedVideoMuted
          }
          resumeFocusedVideo={resumeFocusedVideo && index === resumeMediaIndex}
          onActivate={onActivate ? () => onActivate(index) : undefined}
          activateLabel={activateLabel}
          style={collageCellStyle(index, visible.length, hero)}
          onRatio={(ratio) => onRatio(item.url, ratio)}
        />
      ))}
    </div>
  );
}
