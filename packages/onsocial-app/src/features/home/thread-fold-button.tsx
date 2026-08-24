'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

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

/** Coil-only link to the rest of a thread (Standing peek / link-out). */
export function ThreadCoilTailLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="post-thread-more post-thread-more--coil-tail"
      scroll={false}
      aria-label="Open thread"
    >
      <span className="post-thread-more-coil" aria-hidden />
    </Link>
  );
}
