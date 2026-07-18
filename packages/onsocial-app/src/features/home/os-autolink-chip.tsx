'use client';

import type { MouseEvent } from 'react';
import { LinkIcon } from '@onsocial/ui';
import { autolinkDisplayHost } from '@/features/home/post-rich-segments';

type OsAutolinkVariant = 'display' | 'mirror';

/**
 * Inline http(s) chip.
 * - `display` — Mage link + hostname (posts / bio view)
 * - `mirror` — full URL text for textarea caret sync; icon hangs out of flow
 */
export function OsAutolinkChip({
  href,
  as: Tag = 'span',
  variant = 'display',
  className,
  onClick,
}: {
  href: string;
  as?: 'span' | 'a';
  variant?: OsAutolinkVariant;
  className?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
}) {
  const label = variant === 'mirror' ? href : autolinkDisplayHost(href);
  const classes = [
    'os-link',
    variant === 'mirror' ? 'os-link--mirror' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (Tag === 'a') {
    return (
      <a
        href={href}
        className={classes}
        target="_blank"
        rel="noopener noreferrer"
        title={href}
        onClick={onClick}
      >
        <LinkIcon className="os-link-icon" aria-hidden />
        <span className="os-link-label">{label}</span>
      </a>
    );
  }

  return (
    <span className={classes} title={href}>
      <LinkIcon className="os-link-icon" aria-hidden />
      <span className="os-link-label">{label}</span>
    </span>
  );
}
