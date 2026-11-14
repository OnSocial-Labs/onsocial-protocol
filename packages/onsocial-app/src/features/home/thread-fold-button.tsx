'use client';

import Link from 'next/link';
import type { MouseEvent, ReactNode } from 'react';
import type { PostRow } from '@onsocial/sdk';
import {
  isUnmodifiedPrimaryClick,
  usePostThreadLayer,
} from '@/features/home/post-thread-layer';
import type { ThreadSheetContext } from '@/lib/guild-thread-card-context';
import { isAppPostSheetHref } from '@/lib/post-routes';

/** Expand control for a folded stretch of a reply thread. */
export function ThreadFoldButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className="post-thread-more" onClick={onClick}>
      <span className="post-thread-more-coil" aria-hidden />
      {children}
    </button>
  );
}

/**
 * One card-tap opener for the feed fold and the standing coil.
 * The permalink stays for modified clicks and direct loads.
 */
function ThreadPostLink({
  href,
  root,
  context = null,
  className,
  ariaLabel,
  children,
}: {
  href: string;
  root?: PostRow | null;
  context?: ThreadSheetContext | null;
  className: string;
  ariaLabel?: string;
  children?: ReactNode;
}) {
  const { openPostThread } = usePostThreadLayer();
  const open = () => {
    if (!isAppPostSheetHref(href)) return false;
    return openPostThread({ href, root, context });
  };
  return (
    <Link
      href={href}
      className={className}
      scroll={false}
      aria-label={ariaLabel}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (!isUnmodifiedPrimaryClick(event)) return;
        if (!open()) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onNavigate={(event) => {
        if (!open()) return;
        event.preventDefault();
      }}
    >
      <span className="post-thread-more-coil" aria-hidden />
      {children}
    </Link>
  );
}

/** Feed fold. Opens the first post of the chain the same way a card does. */
export function ThreadFoldLink({
  href,
  root,
  context = null,
  children,
}: {
  href: string;
  root: PostRow;
  context?: ThreadSheetContext | null;
  children: ReactNode;
}) {
  return (
    <ThreadPostLink href={href} root={root} context={context} className="post-thread-more">
      {children}
    </ThreadPostLink>
  );
}

/**
 * Coil-only link to the rest of a thread (Standing peek / link-out).
 * Primary taps open the thread sheet over the feed — same as a card-body tap.
 */
export function ThreadCoilTailLink({
  href,
  root = null,
  context = null,
}: {
  href: string;
  root?: PostRow | null;
  context?: ThreadSheetContext | null;
}) {
  return (
    <ThreadPostLink
      href={href}
      root={root}
      context={context}
      className="post-thread-more post-thread-more--coil-tail"
      ariaLabel="Open the rest of this thread"
    />
  );
}
