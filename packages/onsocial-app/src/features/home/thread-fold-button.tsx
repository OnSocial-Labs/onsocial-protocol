'use client';

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
