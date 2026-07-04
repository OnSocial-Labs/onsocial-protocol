'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from './cn.js';

export type ProfileAvatarSize = 'sm' | 'md' | 'lg';

export const profileAvatarClassName = 'profile-avatar';

export function profileAvatarSizeClassName(size: ProfileAvatarSize): string {
  return `profile-avatar--${size}`;
}

export interface ProfileAvatarProps {
  src?: string | null;
  fallbackInitial?: string;
  /** Profile shell fetch in progress — show shimmer, not initials. */
  shellLoading?: boolean;
  size?: ProfileAvatarSize;
  className?: string;
}

function imageReady(img: HTMLImageElement | null): boolean {
  return Boolean(img?.complete && img.naturalWidth > 0);
}

export function ProfileAvatar({
  src = null,
  fallbackInitial,
  shellLoading = false,
  size = 'md',
  className,
}: ProfileAvatarProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [mediaError, setMediaError] = useState(false);

  useEffect(() => {
    setMediaLoaded(false);
    setMediaError(false);
  }, [src]);

  useLayoutEffect(() => {
    if (imageReady(imgRef.current)) {
      setMediaLoaded(true);
    }
  }, [src]);

  const hasSrc = Boolean(src) && !mediaError;
  const showShellLoading = shellLoading && !hasSrc;
  const showMediaLoading = hasSrc && !mediaLoaded;
  const showShimmer = showShellLoading || showMediaLoading;
  const showFallback =
    !showShellLoading && !hasSrc && Boolean(fallbackInitial?.trim());
  const showEmptyFallback =
    !showShellLoading && !hasSrc && !showFallback && !shellLoading;

  return (
    <span
      className={cn(
        profileAvatarClassName,
        profileAvatarSizeClassName(size),
        showShimmer && 'is-media-loading',
        showShellLoading && 'is-shell-loading',
        mediaLoaded && 'is-loaded',
        className
      )}
      aria-hidden
    >
      {showShimmer ? <span className="profile-avatar__shimmer" /> : null}
      {hasSrc ? (
        <img
          ref={imgRef}
          src={src ?? undefined}
          alt=""
          className="profile-avatar__img"
          decoding="async"
          onLoad={() => setMediaLoaded(true)}
          onError={() => setMediaError(true)}
        />
      ) : null}
      {showFallback ? (
        <span className="profile-avatar__fallback">
          <span className="profile-avatar__initial">
            {fallbackInitial!.trim().charAt(0).toUpperCase()}
          </span>
        </span>
      ) : null}
      {showEmptyFallback ? (
        <span className="profile-avatar__fallback profile-avatar__fallback--empty" />
      ) : null}
    </span>
  );
}
