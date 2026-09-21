'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { OsIconAction, UserPlusFillIcon } from '@onsocial/ui';
import { appDiscoverTabHref } from '@/features/discover/discover-tabs';
import { useStandingPanel } from '@/components/panels/standing-panel-context';

const DISCOVER_PROFILES_LABEL = 'Discover profiles to stand with';
const DISCOVER_DAOS_LABEL = 'Discover DAOs to stand with';

function discoverLabel(isDaoSubject: boolean): string {
  return isDaoSubject ? DISCOVER_DAOS_LABEL : DISCOVER_PROFILES_LABEL;
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
    <Link
      href={href}
      className={className}
      aria-label={ariaLabel}
      scroll={false}
    >
      {children}
    </Link>
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
  const href = appDiscoverTabHref(tab);

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
}: {
  variant?: 'accent' | 'chrome';
  /** @deprecated Discover opens in the tab. The sheet stays underneath. */
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
