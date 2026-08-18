'use client';

import Link from 'next/link';

/** Quiet handoff from Discover find → launcher apps (create / manage). */
export function DiscoverCommunityHandoff({
  links,
}: {
  links: ReadonlyArray<{ href: string; label: string }>;
}) {
  if (links.length === 0) return null;

  return (
    <nav
      className="discover-community-handoff"
      aria-label="Open related apps"
    >
      {links.map((link, index) => (
        <span key={link.href} className="discover-community-handoff-item">
          {index > 0 ? (
            <span className="discover-community-handoff-sep" aria-hidden>
              ·
            </span>
          ) : null}
          <Link
            href={link.href}
            className="discover-community-handoff-link"
            scroll={false}
          >
            {link.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
