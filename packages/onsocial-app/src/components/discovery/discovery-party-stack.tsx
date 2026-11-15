'use client';

import Link from 'next/link';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { collectionCreatorNameLine } from '@/features/scarces/collection-creator-face';
import { portfolioPath } from '@/lib/overlay-routes';
import { fallbackLabel } from '@/lib/profile-display';

/**
 * Creator party chrome for Market / Drops catalog rows —
 * avatar beside the name, @handle under it.
 * “by” / “bought by” sit above the face, in line with the title.
 * Use `link={false}` when nested inside a row that is already a link.
 */
export function DiscoveryPartyStack({
  accountId,
  displayName: profileDisplayName,
  avatarUrl,
  lead = 'by',
  link = true,
}: {
  accountId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  /** Quiet line above the face. `false` leaves the name alone. */
  lead?: 'by' | 'bought by' | 'listed by' | false;
  /** Portfolio link. Off when the row itself is the only hit target. */
  link?: boolean;
}) {
  const href = portfolioPath(accountId);
  const handle = fallbackLabel(accountId);
  const name = collectionCreatorNameLine(accountId, profileDisplayName);
  const leadText =
    lead === 'listed by'
      ? 'Listed by'
      : lead === 'bought by'
        ? 'Bought by'
        : lead
          ? lead
          : null;
  const className = `drops-discovery-party${leadText ? ' drops-discovery-party--lead' : ''}`;
  const face = (
    <>
      <AccountAvatar
        accountId={accountId}
        src={avatarUrl}
        size="sm"
        fallbackInitial={name.slice(0, 1)}
        className="drops-discovery-party-avatar"
      />
      <span className="drops-discovery-party-stack">
        {leadText ? (
          <span className="drops-discovery-lead">{leadText}</span>
        ) : null}
        <span className="drops-discovery-by">{name}</span>
        <span className="drops-discovery-sub">@{handle}</span>
      </span>
    </>
  );

  if (!link) {
    return <span className={className}>{face}</span>;
  }

  return (
    <Link href={href} scroll={false} className={className}>
      {face}
    </Link>
  );
}
