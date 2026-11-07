'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from './cn.js';
import { IpfsBlurPreview } from './ipfs-blur-preview.js';
import { IpfsImg } from './ipfs-img.js';
import { ipfsImgSrcSet } from './ipfs-img-variants.js';

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

/** Two rungs cover every avatar slot: ≤40px base sizes and ~96px heroes at 3x. */
const AVATAR_VARIANT_WIDTHS = [128, 384] as const;

/** Rendered width per base size — profile-avatar--sm/md/lg at a 16px root. */
const AVATAR_IMG_SIZES: Record<ProfileAvatarSize, string> = {
  sm: '22px',
  md: '32px',
  lg: '40px',
};

/**
 * Nav / dock faces paint at `--os-avatar-nav` (~1.85rem) on every viewport,
 * even when the component still passes size="sm". Match the image request.
 */
function avatarImgSizes(
  size: ProfileAvatarSize,
  className: string | undefined,
  imgSizes: string | undefined
): string {
  if (imgSizes) return imgSizes;
  if (
    className?.includes('os-nav-face') ||
    className?.includes('account-drawer-avatar') ||
    className?.includes('os-chrome-subject__avatar')
  ) {
    return '30px';
  }
  return AVATAR_IMG_SIZES[size];
}

export interface ProfileAvatarProps {
  src?: string | null;
  fallbackInitial?: string;
  /** Profile shell fetch in progress — show shimmer, not initials. */
  shellLoading?: boolean;
  size?: ProfileAvatarSize;
  /** Omit / circle keeps today’s look for renderers that do not know kind. */
  shape?: ProfileAvatarShape;
  /** `sizes` override for CSS-enlarged avatars (e.g. a 96px profile hero). */
  imgSizes?: string;
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
  imgSizes,
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
  const srcSet = hasSrc ? ipfsImgSrcSet(src, AVATAR_VARIANT_WIDTHS) : undefined;
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
      {hasSrc ? <IpfsBlurPreview src={src} /> : null}
      {hasSrc ? (
        <IpfsImg
          ref={imgRef}
          src={src ?? undefined}
          srcSet={srcSet}
          sizes={srcSet ? avatarImgSizes(size, className, imgSizes) : undefined}
          alt=""
          className="profile-avatar__img"
          loading="lazy"
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
