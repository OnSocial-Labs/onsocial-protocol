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

/**
 * One card-tap opener for a thread fold.
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

