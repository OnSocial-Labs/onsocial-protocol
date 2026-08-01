'use client';

import { useState } from 'react';
import { SOCIAL_TOKEN_ICON_FALLBACK } from '@/hooks/use-social-token-icon';

interface TokenIconProps {
  src?: string | null;
  label: string;
  className?: string;
}

function withTokenIconClass(
  variant: 'mark' | 'image' | 'fallback',
  className?: string
): string {
  if (className) {
    if (variant === 'image') return className;
    const modifier =
      variant === 'mark' ? 'app-token-icon--mark' : 'app-token-icon--fallback';
    return className.includes(modifier)
      ? className
      : `${className} ${modifier}`;
  }
  if (variant === 'mark') return 'app-token-icon app-token-icon--mark';
  if (variant === 'fallback') return 'app-token-icon app-token-icon--fallback';
  return 'app-token-icon';
}

/**
 * Circular FT icon with letter / brand-mark fallback — amount-field unit mark.
 * Brand SVG fallback uses a CSS mask so it tracks `--fg` on any mood.
 * Custom `className` keeps the variant modifier (`--mark` / `--fallback`).
 */
export function TokenIcon({ src, label, className }: TokenIconProps) {
  const [failedForSrc, setFailedForSrc] = useState<string | null>(null);
  const imageFailed = Boolean(src) && failedForSrc === src;
  const letter = (label.trim()[0] ?? '?').toUpperCase();
  const useBrandMark =
    Boolean(src) &&
    (src === SOCIAL_TOKEN_ICON_FALLBACK || src?.endsWith('/onsocial_icon.svg'));

  if (useBrandMark && !imageFailed) {
    return (
      <span className={withTokenIconClass('mark', className)} aria-hidden />
    );
  }

  if (src && !imageFailed) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden
        className={withTokenIconClass('image', className)}
        onError={() => setFailedForSrc(src)}
      />
    );
  }

  return (
    <span className={withTokenIconClass('fallback', className)} aria-hidden>
      {letter}
    </span>
  );
}
