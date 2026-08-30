'use client';

import type { MouseEvent, ReactNode } from 'react';
import { OsIconAction, UserPlusFillIcon } from '@onsocial/ui';
import { useStandingPanel } from '@/components/panels/standing-panel-context';
import { discoverPath } from '@/lib/overlay-routes';

const DISCOVER_PROFILES_LABEL = 'Discover profiles to stand with';
const DISCOVER_DAOS_LABEL = 'Discover DAOs to stand with';

function discoverLabel(isDaoSubject: boolean): string {
  return isDaoSubject ? DISCOVER_DAOS_LABEL : DISCOVER_PROFILES_LABEL;
}

/** Hard full-page nav — never soft-swaps into portfolio glass Discover. */
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
  className,
  ariaLabel,
  children,
}: {
  href: string;
  className: string;
  ariaLabel: string;
  children: ReactNode;
}) {
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

export function DiscoverProfilesLink({
  accountId,
  tab = 'profiles',
  variant = 'accent',
  ariaLabel = 'Discover profiles',
}: {
  accountId: string;
  tab?: 'profiles' | 'daos';
  variant?: 'accent' | 'chrome';
  ariaLabel?: string;
}) {
  const href = discoverPath(accountId, { tab });

  if (variant === 'chrome') {
    return (
      <OsIconAction asChild ariaLabel={ariaLabel}>
        <DiscoverNavLink href={href} className="" ariaLabel={ariaLabel}>
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
      className="standing-discover-link standing-discover-link--accent"
      ariaLabel={ariaLabel}
    >
      <UserPlusFillIcon className="standing-discover-icon" aria-hidden />
      <span className="standing-discover-label">Discover</span>
    </DiscoverNavLink>
  );
}

export function StandingDiscoverLink({
  variant = 'accent',
  closeOverlay: _closeOverlay = false,
}: {
  variant?: 'accent' | 'chrome';
  /** @deprecated Discover from standing is always hard full-page nav. */
  closeOverlay?: boolean;
}) {
  const { accountId, isDaoSubject } = useStandingPanel();
  return (
    <DiscoverProfilesLink
      accountId={accountId}
      tab={isDaoSubject ? 'daos' : 'profiles'}
      variant={variant}
      ariaLabel={discoverLabel(isDaoSubject)}
    />
  );
}
