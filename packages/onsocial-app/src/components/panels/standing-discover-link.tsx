'use client';

import Link from 'next/link';
import type { MouseEvent, ReactNode } from 'react';
import { UserPlusFillIcon, osIconActionClassName } from '@onsocial/ui';
import { useStandingPanel } from '@/components/panels/standing-panel-context';
import { discoverPath } from '@/lib/overlay-routes';

const DISCOVER_LABEL = 'Discover profiles to stand with';

function assignFullPageNav(
  event: MouseEvent<HTMLAnchorElement>,
  href: string
) {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  event.preventDefault();
  window.location.assign(href);
}

function DiscoverNavLink({
  href,
  fullPageNav,
  closeOverlay,
  className,
  children,
}: {
  href: string;
  fullPageNav: boolean;
  closeOverlay: boolean;
  className: string;
  children: ReactNode;
}) {
  if (fullPageNav) {
    return (
      <a
        href={href}
        className={className}
        aria-label={DISCOVER_LABEL}
        onClick={(event) => assignFullPageNav(event, href)}
      >
        {children}
      </a>
    );
  }

  return (
    <Link
      href={href}
      replace={closeOverlay}
      scroll={false}
      className={className}
      aria-label={DISCOVER_LABEL}
    >
      {children}
    </Link>
  );
}

export function StandingDiscoverLink({
  variant = 'accent',
  closeOverlay = false,
}: {
  variant?: 'accent' | 'chrome';
  closeOverlay?: boolean;
}) {
  const { accountId, shellVariant } = useStandingPanel();
  const href = discoverPath(accountId);
  const fullPageNav = shellVariant === 'page';

  if (variant === 'chrome') {
    return (
      <DiscoverNavLink
        href={href}
        fullPageNav={fullPageNav}
        closeOverlay={closeOverlay}
        className={osIconActionClassName}
      >
        <UserPlusFillIcon
          className="glass-sheet-icon-action-glyph glass-sheet-icon-action-glyph--discover"
          aria-hidden
        />
      </DiscoverNavLink>
    );
  }

  return (
    <DiscoverNavLink
      href={href}
      fullPageNav={fullPageNav}
      closeOverlay={closeOverlay}
      className="standing-discover-link standing-discover-link--accent"
    >
      <UserPlusFillIcon className="standing-discover-icon" aria-hidden />
      <span className="standing-discover-label">Discover</span>
    </DiscoverNavLink>
  );
}
