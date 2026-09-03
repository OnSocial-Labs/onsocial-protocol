'use client';

import Link from 'next/link';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { portfolioPath } from '@/lib/overlay-routes';
import { displayName, fallbackLabel } from '@/lib/profile-display';

/**
 * Creator party chrome for Market / Drops catalog rows —
 * avatar + “by Name” / @handle (same layout on both surfaces).
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
  const label = displayName(accountId, profileDisplayName ?? undefined);
  const nameIsCustom =
    Boolean(label) &&
    label.toLowerCase() !== handle.toLowerCase() &&
    label.toLowerCase() !== accountId.trim().toLowerCase();

  return (
    <div className="drops-discovery-party">
      <Link
        href={href}
        scroll={false}
        className="drops-discovery-party-avatar-link"
        tabIndex={nameIsCustom ? -1 : undefined}
        aria-hidden={nameIsCustom ? true : undefined}
        aria-label={nameIsCustom ? undefined : `Creator @${handle}`}
      >
        <AccountAvatar
          accountId={accountId}
          src={avatarUrl}
          size="sm"
          fallbackInitial={handle.slice(0, 1)}
          className="drops-discovery-party-avatar"
        />
      </Link>
      <div className="drops-discovery-party-stack">
        {nameIsCustom ? (
          <Link href={href} scroll={false} className="drops-discovery-by">
            by {label}
          </Link>
        ) : (
          <Link href={href} scroll={false} className="drops-discovery-by">
            @{handle}
          </Link>
        )}
        {nameIsCustom ? (
          <span className="drops-discovery-sub">@{handle}</span>
        ) : null}
      </div>
    </div>
  );
}
