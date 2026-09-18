'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { ChevronLeftIcon, ChevronRightIcon, OsIconAction } from '@onsocial/ui';
import { OsMediaFaceShell } from '@/components/os/os-media-face-shell';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';
import {
  feedPhotoIndexFromScroll,
  feedPhotoScrollLeft,
  isRenderablePostVideoMime,
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

type CaptionMode = 'peek' | 'expanded';

/**
 * Feed media enlarge — photos + video in the shared media-face shell.
 * Optional `stage` shows a non-URL face (mood / craft article cover).
 * Caption peeks over the media (no rescale); tap toggles expand/collapse
 * with a smooth rise + light mute.
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
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const skipSnapRef = useRef(false);
  const prevOpenRef = useRef(open);
  const indexRef = useRef(index);
  const quietClose =
    closeAriaLabel ?? (quiet ? 'Close photo' : 'Back from media');
  const slideClass = quiet
    ? 'feed-photo-slide feed-photo-slide--quiet'
    : 'feed-photo-slide';
  const hasVideo = photos.some((item) => isRenderablePostVideoMime(item.mime));
  const showStage = Boolean(stage) && photos.length === 0;
  const captionExpanded = hasCaption && captionMode === 'expanded';

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setIndex(clampIndex(initialIndex, last));
      setCaptionMode('peek');
    }
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
    if (!open || photos.length < 2) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && captionMode === 'expanded') {
        event.preventDefault();
        setCaptionMode('peek');
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goTo(stepFeedPhotoIndex(index, last, -1));
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goTo(stepFeedPhotoIndex(index, last, 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, photos.length, last, index, goTo, captionMode]);

  /* Play the active video with sound; pause neighbors. */
  useEffect(() => {
    if (!open) {
      videoRefs.current.forEach((video) => {
        video.pause();
      });
      return;
    }
    videoRefs.current.forEach((video, videoIndex) => {
      if (videoIndex === index) {
        video.muted = false;
        void video.play().catch(() => {
          /* autoplay may require a gesture — controls remain */
        });
        return;
      }
      video.pause();
      video.muted = true;
    });
  }, [open, index]);

  /* Video play collapses expand back to the under-media peek. */
  useEffect(() => {
    if (!open || !hasCaption || captionMode !== 'expanded') return;
    const video = videoRefs.current.get(index);
    if (!video || !isRenderablePostVideoMime(photos[index]?.mime)) return;
    const onPlay = () => setCaptionMode('peek');
    video.addEventListener('play', onPlay);
    return () => video.removeEventListener('play', onPlay);
  }, [open, index, photos, hasCaption, captionMode]);

  const showNav = photos.length > 1;

  return (
    <OsMediaFaceShell
      open={open}
      onClose={() => onOpenChange(false)}
      title={title}
      quietTitle={quiet}
      closeAriaLabel={quietClose}
      zIndex={SCARCE_Z.listenShell}
      footer={engagement}
      stageLayout="fixed"
      className={slideClass}
      contentClassName="feed-photo-slide-body"
    >
      <div className="feed-photo-listen">
        <div className="feed-photo-stage">
          {showStage ? (
            stage
          ) : showNav ? (
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
            />
          )}
          {hasCaption ? (
            <div
              className={
                captionExpanded
                  ? 'feed-photo-caption is-expanded'
                  : 'feed-photo-caption is-peek'
              }
            >
              <button
                type="button"
                className="feed-photo-caption-mute"
                tabIndex={captionExpanded ? 0 : -1}
                aria-hidden={!captionExpanded}
                aria-label="Collapse caption"
                onClick={() => setCaptionMode('peek')}
              />
              <button
                type="button"
                className="feed-photo-caption-body"
                aria-expanded={captionExpanded}
                aria-label={
                  captionExpanded ? 'Collapse caption' : 'Show full post'
                }
                onClick={() =>
                  setCaptionMode(captionExpanded ? 'peek' : 'expanded')
                }
              >
                {captionExpanded ? (
                  <span className="feed-photo-caption-full">{captionText}</span>
                ) : (
                  <span className="feed-photo-caption-peek-text">
                    {captionText}
                  </span>
                )}
              </button>
            </div>
          ) : null}
        </div>
        {showNav ? (
          <div
            className="feed-photo-nav"
            role="group"
            aria-label={hasVideo ? 'Media' : 'Photos'}
          >
            <OsIconAction
              ariaLabel="Previous"
              className="feed-photo-nav-btn"
              disabled={index <= 0}
              onClick={() => goTo(stepFeedPhotoIndex(index, last, -1))}
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
                  onClick={() => goTo(photoIndex)}
                />
              ))}
            </div>
            <OsIconAction
              ariaLabel="Next"
              className="feed-photo-nav-btn"
              disabled={index >= last}
              onClick={() => goTo(stepFeedPhotoIndex(index, last, 1))}
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
}: {
  item: PostMediaItem | null;
  active: boolean;
  photoIndex: number;
  videoRefs: MutableRefObject<Map<number, HTMLVideoElement>>;
}) {
  if (!item) {
    return (
      <div className="feed-photo-image feed-photo-image--empty" aria-hidden />
    );
  }
  if (isRenderablePostVideoMime(item.mime)) {
    return (
      <video
        ref={(node) => {
          if (node) videoRefs.current.set(photoIndex, node);
          else videoRefs.current.delete(photoIndex);
        }}
        src={item.url}
        className="feed-photo-image feed-photo-video"
        controls
        playsInline
        preload="metadata"
        // Active page plays with sound; inactive stays muted.
        muted={!active}
      />
    );
  }
  return (
    <img
      src={item.url}
      alt={item.alt?.trim() || ''}
      className="feed-photo-image"
      draggable={false}
    />
  );
}
