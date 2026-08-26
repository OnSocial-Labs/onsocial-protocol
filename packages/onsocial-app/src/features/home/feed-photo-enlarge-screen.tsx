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
 * Feed photo enlarge — same OsSlideOverScreen as Drops thought enlarge.
 * Engagement (reply / like / quote / boost) sits under the photo.
 */
export function FeedPhotoEnlargeScreen({
  open,
  onOpenChange,
  title,
  subtitle,
  photos,
  initialIndex = 0,
  engagement = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string | null;
  photos: PostMediaItem[];
  initialIndex?: number;
  engagement?: ReactNode;
}) {
  const last = photos.length - 1;
  const [wasOpen, setWasOpen] = useState(open);
  const [index, setIndex] = useState(() => clampIndex(initialIndex, last));
  const trackRef = useRef<HTMLDivElement>(null);
  const skipSnapRef = useRef(false);
  const prevOpenRef = useRef(open);

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
    const snap = () => {
      track.scrollTo({
        left: feedPhotoScrollLeft(index, track.clientWidth),
        behavior: 'auto',
      });
    };
    const observer = new ResizeObserver(snap);
    observer.observe(track);
    return () => observer.disconnect();
  }, [open, index, photos.length]);

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
  const postChrome = engagement ? (
    <div className="scarce-post-medium-chrome">{engagement}</div>
  ) : null;

  return (
    <OsSlideOverScreen
      open={open}
      onClose={() => onOpenChange(false)}
      title={title}
      subtitle={subtitle?.trim() || undefined}
      closeAriaLabel="Back from photo"
      zIndex={SCARCE_Z.listenShell}
      className="scarce-medium-slide feed-photo-slide"
      contentClassName="scarce-medium-slide-body feed-photo-slide-body"
    >
      <div className="scarce-clip-listen scarce-post-medium-listen feed-photo-listen">
        <div className="scarce-clip-listen-art feed-photo-stage">
          {showNav ? (
            <div
              ref={trackRef}
              className="feed-photo-track"
              onScroll={() => {
                const track = trackRef.current;
                if (!track) return;
                const next = feedPhotoIndexFromScroll(
                  track.scrollLeft,
                  track.clientWidth,
                  last
                );
                if (next === index) return;
                skipSnapRef.current = true;
                setIndex(next);
              }}
            >
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
            <span className="feed-photo-count" aria-live="polite">
              {index + 1} / {photos.length}
            </span>
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
          </div>
        ) : null}
        {postChrome ? (
          <div className="scarce-clip-listen-footer">{postChrome}</div>
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
