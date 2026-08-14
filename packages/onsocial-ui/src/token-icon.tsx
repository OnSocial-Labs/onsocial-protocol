'use client';

import { useEffect, useState } from 'react';
import { cn } from './cn.js';

export type TokenIconSize = 'sm' | 'md';

export const osTokenIconClassName = 'os-token-icon';

export interface TokenIconProps {
  src?: string | null;
  label: string;
  className?: string;
  /** Default `sm` (1rem). Portal amount/wallet rows often use `md`. */
  size?: TokenIconSize;
}

function isBrandMarkSrc(src: string | null | undefined): boolean {
  if (!src) return false;
  return src === '/onsocial_icon.svg' || src.endsWith('/onsocial_icon.svg');
}

function withTokenIconClass(
  variant: 'mark' | 'image' | 'fallback',
  size: TokenIconSize,
  className?: string
): string {
  const sizeClass = `os-token-icon--${size}`;
  const base = cn(osTokenIconClassName, 'app-token-icon', sizeClass);

  if (variant === 'image') {
    return cn(base, className);
  }

  const modifier =
    variant === 'mark'
      ? 'os-token-icon--mark app-token-icon--mark'
      : 'os-token-icon--fallback app-token-icon--fallback';

  return cn(base, modifier, className);
}

/**
 * Circular FT icon with letter / brand-mark fallback — amount-field unit mark.
 * Brand SVG fallback uses a CSS mask so it tracks `--fg` on any mood.
 * Pair with `os-token-icon.css`. Legacy alias: `.app-token-icon*`.
 */
export function TokenIcon({
  src,
  label,
  className,
  size = 'sm',
}: TokenIconProps) {
  const [failedForSrc, setFailedForSrc] = useState<string | null>(null);

  useEffect(() => {
    setFailedForSrc(null);
  }, [src]);

  const imageFailed = Boolean(src) && failedForSrc === src;
  const letter = (label.trim()[0] ?? '?').toUpperCase();
  const useBrandMark = isBrandMarkSrc(src);

  if (useBrandMark && !imageFailed) {
    return (
      <span
        className={withTokenIconClass('mark', size, className)}
        aria-hidden
      />
    );
  }

  if (src && !imageFailed) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden
        className={withTokenIconClass('image', size, className)}
        onError={() => setFailedForSrc(src)}
      />
    );
  }

  return (
    <span
      className={withTokenIconClass('fallback', size, className)}
      aria-hidden
    >
      {letter}
    </span>
  );
}
