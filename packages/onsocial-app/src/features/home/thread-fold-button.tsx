'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
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
 * Coil-only link to the rest of a thread (Standing peek / link-out).
 * Primary taps open the thread sheet over the feed — same as a card-body
 * tap; the href stays for modified clicks and direct loads.
 */
export function ThreadCoilTailLink({
  href,
  root = null,
  context = null,
}: {
  href: string;
  /** Peek post — paints the sheet instantly, same as a card tap. */
  root?: PostRow | null;
  /** Feed the coil was opened from. */
  context?: ThreadSheetContext | null;
}) {
  const { openPostThread } = usePostThreadLayer();
  return (
    <Link
      href={href}
      className="post-thread-more post-thread-more--coil-tail"
      scroll={false}
      aria-label="Open the rest of this thread"
      onClick={(event) => {
        if (!isUnmodifiedPrimaryClick(event)) return;
        if (!isAppPostSheetHref(href)) return;
        if (!openPostThread({ href, root, context })) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onNavigate={(event) => {
        if (!isAppPostSheetHref(href)) return;
        if (!openPostThread({ href, root, context })) return;
        event.preventDefault();
      }}
    >
      <span className="post-thread-more-coil" aria-hidden />
    </Link>
  );
}
