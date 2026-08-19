'use client';

import Link from 'next/link';
import type { MouseEvent, ReactNode } from 'react';
import { OsIconAction, UserPlusFillIcon } from '@onsocial/ui';
import { useStandingPanel } from '@/components/panels/standing-panel-context';
import { discoverPath } from '@/lib/overlay-routes';

const DISCOVER_PROFILES_LABEL = 'Discover profiles to stand with';
const DISCOVER_DAOS_LABEL = 'Discover DAOs to stand with';

function discoverLabel(isDaoSubject: boolean): string {
  return isDaoSubject ? DISCOVER_DAOS_LABEL : DISCOVER_PROFILES_LABEL;
}

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
  ariaLabel,
  children,
}: {
  href: string;
  fullPageNav: boolean;
  closeOverlay: boolean;
  className: string;
  ariaLabel: string;
  children: ReactNode;
}) {
  if (fullPageNav) {
    return (
      <a
        href={href}
        className={className}
        aria-label={ariaLabel}
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
      aria-label={ariaLabel}
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
  const { accountId, shellVariant, isDaoSubject } = useStandingPanel();
  const href = discoverPath(accountId, {
    tab: isDaoSubject ? 'daos' : 'profiles',
  });
  const fullPageNav = shellVariant === 'page';
  const ariaLabel = discoverLabel(isDaoSubject);

  if (variant === 'chrome') {
    return (
      <OsIconAction asChild ariaLabel={ariaLabel}>
        <DiscoverNavLink
          href={href}
          fullPageNav={fullPageNav}
          closeOverlay={closeOverlay}
          className=""
          ariaLabel={ariaLabel}
        >
          <UserPlusFillIcon
            className="glass-sheet-icon-action-glyph glass-sheet-icon-action-glyph--discover"
            aria-hidden
          />
        </DiscoverNavLink>
      </OsIconAction>
    );
  }

  return (
    <DiscoverNavLink
      href={href}
      fullPageNav={fullPageNav}
      closeOverlay={closeOverlay}
      className="standing-discover-link standing-discover-link--accent"
      ariaLabel={ariaLabel}
    >
      <UserPlusFillIcon className="standing-discover-icon" aria-hidden />
      <span className="standing-discover-label">Discover</span>
    </DiscoverNavLink>
  );
}
