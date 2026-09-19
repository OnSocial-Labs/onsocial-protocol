'use client';

import { useEffect, useRef, useState } from 'react';
import { VolumeMuteIcon, VolumeUpIcon } from '@onsocial/ui';
import {
  usePostVideoPlayback,
  type PostVideoPlaybackMode,
} from '@/hooks/use-post-list-video';
import type { PostMediaItem } from '@/lib/post-media';
import {
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
  onRemove?: () => void;
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
  onRemove,
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
  const [soundOff, setSoundOff] = useState(focusedVideoMuted);

  useEffect(() => {
    setSoundOff(focusedVideoMuted);
  }, [focusedVideoMuted]);

  return (
    <div
      ref={playbackMode ? containerRef : undefined}
      className={[
        'post-media-tile',
        `post-media-tile--${size}`,
        isActivatable ? 'is-activatable' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={
        isActivatable
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              onActivate?.();
            }
          : undefined
      }
      onPointerDown={
        isActivatable ? (event) => event.stopPropagation() : undefined
      }
    >
      {isVideo ? (
        <video
          ref={playbackMode ? videoRef : undefined}
          src={item.url}
          playsInline
          muted={
            isListVideo ||
            playbackDisabled ||
            (isDetailVideo && soundOff)
          }
          loop={isListVideo || isDetailVideo}
          preload="metadata"
          data-post-focus-video={isDetailVideo ? String(index) : undefined}
          className="post-media-element"
        />
      ) : (
        <img
          src={item.url}
          alt={item.alt?.trim() || ''}
          className="post-media-element"
          loading={item.url.startsWith('blob:') ? 'eager' : 'lazy'}
          decoding="async"
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
}: PostMediaStripProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const visible = items.slice(0, 4);
  const isCarousel = focused && visible.length > 1;

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
        />
      ))}
    </div>
  );
}
