'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

function crestMonogram(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function LauncherMineRail({ children }: { children: ReactNode }) {
  return <ul className="launcher-mine-rail">{children}</ul>;
}

export function LauncherMineCard({
  href,
  title,
  meta,
  imageUrl,
  ariaLabel,
}: {
  href: string;
  title: string;
  meta: string;
  imageUrl?: string | null;
  ariaLabel?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="launcher-mine-card"
        scroll={false}
        aria-label={ariaLabel ?? title}
      >
        <span className="launcher-mine-crest" aria-hidden>
          {imageUrl ? (
            <img src={imageUrl} alt="" />
          ) : (
            <span className="launcher-mine-crest-fallback">
              {crestMonogram(title)}
            </span>
          )}
        </span>
        <span className="launcher-mine-card-copy">
          <span className="launcher-mine-card-title">{title}</span>
          <span className="launcher-mine-card-meta">{meta}</span>
        </span>
      </Link>
    </li>
  );
}
