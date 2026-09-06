'use client';

import Link from 'next/link';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { collectionCreatorNameLine } from '@/features/scarces/collection-creator-face';
import { portfolioPath } from '@/lib/overlay-routes';
import { fallbackLabel } from '@/lib/profile-display';

/**
 * Creator party chrome for Market / Drops catalog rows —
 * avatar + “by Name” + @handle (same as the drop page).
 */
export function DiscoveryPartyStack({
  accountId,
  displayName: profileDisplayName,
  avatarUrl,
}: {
  accountId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}) {
  const href = portfolioPath(accountId);
  const handle = fallbackLabel(accountId);
  const name = collectionCreatorNameLine(accountId, profileDisplayName);

  return (
    <div className="drops-discovery-party">
      <Link
        href={href}
        scroll={false}
        className="drops-discovery-party-avatar-link"
        tabIndex={-1}
        aria-hidden
      >
        <AccountAvatar
          accountId={accountId}
          src={avatarUrl}
          size="sm"
          fallbackInitial={name.slice(0, 1)}
          className="drops-discovery-party-avatar"
        />
      </Link>
      <div className="drops-discovery-party-stack">
        <Link href={href} scroll={false} className="drops-discovery-by">
          by {name}
        </Link>
        <span className="drops-discovery-sub">@{handle}</span>
      </div>
    </div>
  );
}
