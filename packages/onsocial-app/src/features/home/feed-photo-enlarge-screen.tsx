'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, OsIconAction } from '@onsocial/ui';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';
import type { PostMediaItem } from '@/lib/post-media';

function clampIndex(value: number, last: number): number {
  if (last < 0) return 0;
  if (!Number.isFinite(value)) return 0;
  return Math.min(last, Math.max(0, Math.floor(value)));
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

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setIndex(clampIndex(initialIndex, last));
  }

  useEffect(() => {
    if (!open || photos.length < 2) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setIndex((current) => (current <= 0 ? last : current - 1));
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setIndex((current) => (current >= last ? 0 : current + 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, photos.length, last]);

  const photo = photos[index];
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
          {photo ? (
            <img
              key={`${photo.cid ?? photo.url}:${index}`}
              src={photo.url}
              alt={photo.alt?.trim() || ''}
              className="feed-photo-image"
            />
          ) : (
            <div
              className="feed-photo-image feed-photo-image--empty"
              aria-hidden
            />
          )}
        </div>
        {showNav ? (
          <div className="feed-photo-nav" role="group" aria-label="Photos">
            <OsIconAction
              ariaLabel="Previous photo"
              className="feed-photo-nav-btn"
              onClick={() =>
                setIndex((current) => (current <= 0 ? last : current - 1))
              }
            >
              <ChevronLeftIcon className="glass-sheet-close-icon" aria-hidden />
            </OsIconAction>
            <span className="feed-photo-count">
              {index + 1} / {photos.length}
            </span>
            <OsIconAction
              ariaLabel="Next photo"
              className="feed-photo-nav-btn"
              onClick={() =>
                setIndex((current) => (current >= last ? 0 : current + 1))
              }
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
