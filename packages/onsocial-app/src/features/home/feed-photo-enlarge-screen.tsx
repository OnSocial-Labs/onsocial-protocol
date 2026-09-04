'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ChevronLeftIcon, ChevronRightIcon, OsIconAction } from '@onsocial/ui';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';
import {
  feedPhotoIndexFromScroll,
  feedPhotoScrollLeft,
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

/**
 * Feed photo enlarge — own OsSlideOverScreen chrome (not Listen / thought).
 * Engagement (reply / like / quote / boost) sits under the photo.
 */
export function FeedPhotoEnlargeScreen({
  open,
  onOpenChange,
  title,
  subtitle,
  heading,
  quiet = false,
  photos,
  initialIndex = 0,
  engagement = null,
  closeAriaLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string | null;
  heading?: ReactNode;
  /** Hide the visual title — picture + × only (About stills). */
  quiet?: boolean;
  photos: PostMediaItem[];
  initialIndex?: number;
  engagement?: ReactNode;
  closeAriaLabel?: string;
}) {
  const last = photos.length - 1;
  const [wasOpen, setWasOpen] = useState(open);
  const [index, setIndex] = useState(() => clampIndex(initialIndex, last));
  const trackRef = useRef<HTMLDivElement>(null);
  const skipSnapRef = useRef(false);
  const prevOpenRef = useRef(open);
  const indexRef = useRef(index);
  const quietHeading = quiet ? <></> : heading;
  const quietClose = closeAriaLabel ?? (quiet ? 'Close photo' : 'Back from photo');
  const slideClass = quiet
    ? 'feed-photo-slide feed-photo-slide--quiet'
    : 'feed-photo-slide';

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setIndex(clampIndex(initialIndex, last));
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
  }, [open, photos.length, last, index, goTo]);

  const showNav = photos.length > 1;

  return (
    <OsSlideOverScreen
      open={open}
      onClose={() => onOpenChange(false)}
      title={title}
      subtitle={subtitle?.trim() || undefined}
      heading={quietHeading}
      closeAriaLabel={quietClose}
      zIndex={SCARCE_Z.listenShell}
      className={slideClass}
      contentClassName="feed-photo-slide-body"
    >
      <div className="feed-photo-listen">
        <div className="feed-photo-stage">
          {showNav ? (
            <div ref={trackRef} className="feed-photo-track">
              {photos.map((item, photoIndex) => (
                <div
                  key={`${item.cid ?? item.url}:${photoIndex}`}
                  className="feed-photo-page"
                >
                  <img
                    src={item.url}
                    alt={item.alt?.trim() || ''}
                    className="feed-photo-image"
                    draggable={false}
                  />
                </div>
              ))}
            </div>
          ) : (
            photoStage(photos[0] ?? null)
          )}
        </div>
        {showNav ? (
          <div className="feed-photo-nav" role="group" aria-label="Photos">
            <OsIconAction
              ariaLabel="Previous photo"
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
                  aria-label={`Go to photo ${photoIndex + 1} of ${photos.length}`}
                  aria-current={photoIndex === index ? 'true' : undefined}
                  onClick={() => goTo(photoIndex)}
                />
              ))}
            </div>
            <OsIconAction
              ariaLabel="Next photo"
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
        {engagement ? (
          <div className="feed-photo-footer">{engagement}</div>
        ) : null}
      </div>
    </OsSlideOverScreen>
  );
}

function photoStage(photo: PostMediaItem | null) {
  if (!photo) {
    return (
      <div className="feed-photo-image feed-photo-image--empty" aria-hidden />
    );
  }
  return (
    <img
      src={photo.url}
      alt={photo.alt?.trim() || ''}
      className="feed-photo-image"
      draggable={false}
    />
  );
}
