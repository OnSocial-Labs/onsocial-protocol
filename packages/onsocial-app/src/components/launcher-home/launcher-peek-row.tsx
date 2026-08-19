'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

export function LauncherPeekList({
  children,
  'aria-label': ariaLabel,
}: {
  children: ReactNode;
  'aria-label': string;
}) {
  return (
    <ul className="launcher-peek-list" aria-label={ariaLabel}>
      {children}
    </ul>
  );
}

export function LauncherPeekRow({
  href,
  title,
  meta,
}: {
  href: string;
  title: string;
  meta: ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="launcher-peek-row" scroll={false}>
        <span className="launcher-peek-row-copy">
          <span className="launcher-peek-row-title">{title}</span>
          <span className="launcher-peek-row-meta">{meta}</span>
        </span>
      </Link>
    </li>
  );
}
