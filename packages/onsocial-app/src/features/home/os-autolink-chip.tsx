'use client';

import type { MouseEvent } from 'react';
import { LinkIcon } from '@onsocial/ui';
import { autolinkDisplayHost } from '@/features/home/post-rich-segments';

type OsAutolinkVariant = 'display' | 'mirror';

/**
 * Inline URL chip.
 * - `display` — hostname label (optional Mage link icon)
 * - `mirror` — exact typed `text` for textarea caret sync (no icon —
 *   hanging an icon would overlap prior characters or break spacing)
 */
export function OsAutolinkChip({
  href,
  text,
  as: Tag = 'span',
  variant = 'display',
  showIcon,
  className,
  onClick,
}: {
  href: string;
  /** Typed token (www… / https…) — required for mirror length sync. */
  text?: string;
  as?: 'span' | 'a';
  variant?: OsAutolinkVariant;
  /** Display default on; mirror always off. Posts pass false. */
  showIcon?: boolean;
  className?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
}) {
  const label =
    variant === 'mirror'
      ? (text ?? href)
      : autolinkDisplayHost(href);
  const iconVisible = variant === 'mirror' ? false : (showIcon ?? true);
  const classes = [
    'os-link',
    variant === 'mirror' ? 'os-link--mirror' : null,
    !iconVisible ? 'os-link--plain' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      {iconVisible ? (
        <LinkIcon className="os-link-icon" aria-hidden />
      ) : null}
      <span className="os-link-label">{label}</span>
    </>
  );

  if (Tag === 'a') {
    return (
      <a
        href={href}
        className={classes}
        target="_blank"
        rel="noopener noreferrer"
        title={href}
        onClick={(event) => {
          event.stopPropagation();
          onClick?.(event);
        }}
      >
        {body}
      </a>
    );
  }

  return (
    <span className={classes} title={href}>
      {body}
    </span>
  );
}
