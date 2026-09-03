'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from './cn.js';

export type ProfileAvatarSize = 'sm' | 'md' | 'lg';
export type ProfileAvatarShape = 'circle' | 'squircle' | 'square';

export const profileAvatarClassName = 'profile-avatar';

export function profileAvatarSizeClassName(size: ProfileAvatarSize): string {
  return `profile-avatar--${size}`;
}

export function profileAvatarShapeClassName(
  shape: ProfileAvatarShape
): string | undefined {
  if (shape === 'circle') return undefined;
  return `profile-avatar--${shape}`;
}

export interface ProfileAvatarProps {
  src?: string | null;
  fallbackInitial?: string;
  /** Profile shell fetch in progress — show shimmer, not initials. */
  shellLoading?: boolean;
  size?: ProfileAvatarSize;
  /** Omit / circle keeps today’s look for renderers that do not know kind. */
  shape?: ProfileAvatarShape;
  className?: string;
}

function imageReady(img: HTMLImageElement | null): boolean {
  return Boolean(img?.complete && img.naturalWidth > 0);
}

/** URLs that have painted once this session — skip shimmer on remount/re-rank. */
const loadedAvatarSrcs = new Set<string>();

function markAvatarSrcLoaded(src: string | null | undefined): void {
  if (src) loadedAvatarSrcs.add(src);
}

export function ProfileAvatar({
  src = null,
  fallbackInitial,
  shellLoading = false,
  size = 'md',
  shape = 'circle',
  className,
}: ProfileAvatarProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [mediaLoaded, setMediaLoaded] = useState(() =>
    Boolean(src && loadedAvatarSrcs.has(src))
  );
  const [mediaError, setMediaError] = useState(false);
  const prevSrcRef = useRef(src);

  // Only reset when the URL actually changes — remounts/reorders with the same
  // cached src should not flash the shimmer (Hot amplify re-rank).
  useLayoutEffect(() => {
    const srcChanged = prevSrcRef.current !== src;
    prevSrcRef.current = src;
    if (srcChanged) {
      setMediaError(false);
      setMediaLoaded(Boolean(src && loadedAvatarSrcs.has(src)));
    }
    if (imageReady(imgRef.current)) {
      markAvatarSrcLoaded(src);
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
        profileAvatarShapeClassName(shape),
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
          onLoad={() => {
            markAvatarSrcLoaded(src);
            setMediaLoaded(true);
          }}
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
