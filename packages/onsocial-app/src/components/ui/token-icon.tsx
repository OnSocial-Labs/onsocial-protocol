'use client';

import { useEffect, useState } from 'react';
import { SOCIAL_TOKEN_ICON_FALLBACK } from '@/hooks/use-social-token-icon';

interface TokenIconProps {
  src?: string | null;
  label: string;
  className?: string;
}

/**
 * Circular FT icon with letter / brand-mark fallback — amount-field unit mark.
 * Brand SVG fallback uses a CSS mask so it tracks `--fg` on any mood.
 */
export function TokenIcon({ src, label, className }: TokenIconProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const letter = (label.trim()[0] ?? '?').toUpperCase();
  const useBrandMark =
    Boolean(src) &&
    (src === SOCIAL_TOKEN_ICON_FALLBACK || src?.endsWith('/onsocial_icon.svg'));

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  if (useBrandMark && !imageFailed) {
    return (
      <span
        className={className ?? 'app-token-icon app-token-icon--mark'}
        aria-hidden
      />
    );
  }

  if (src && !imageFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote/data URI from ft_metadata
      <img
        src={src}
        alt=""
        aria-hidden
        className={className ?? 'app-token-icon'}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <span
      className={className ?? 'app-token-icon app-token-icon--fallback'}
      aria-hidden
    >
      {letter}
    </span>
  );
}
