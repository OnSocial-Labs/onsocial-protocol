'use client';

import Link from 'next/link';
import { ProfileAvatar } from '@onsocial/ui';
import { portfolioPath } from '@/lib/overlay-routes';
import { displayName, fallbackLabel } from '@/lib/profile-display';

/** Author / Seller row shared by Buy, Sell, and other commerce sheets. */
export function ScarcePartyLine({
  label,
  accountId,
  displayNameValue,
  avatarUrl,
}: {
  label: string;
  accountId: string;
  displayNameValue?: string | null;
  avatarUrl?: string | null;
}) {
  const handle = fallbackLabel(accountId);
  const name = displayName(accountId, displayNameValue ?? undefined);
  const nameIsCustom =
    Boolean(name) && name.toLowerCase() !== handle.toLowerCase();
  return (
    <div className="scarce-buy-author-line">
      <span className="scarce-buy-author-label">{label}</span>
      <Link
        href={portfolioPath(accountId)}
        scroll={false}
        className="scarce-buy-party"
      >
        <ProfileAvatar
          src={avatarUrl}
          size="sm"
          className="scarce-buy-party-avatar"
        />
        {/* Always two-line slot so profile hydrate doesn’t grow the hug sheet. */}
        <div className="scarce-buy-party-text">
          <div className="scarce-buy-party-name">
            {nameIsCustom ? name : `@${handle}`}
          </div>
          <div
            className="scarce-buy-party-handle"
            {...(nameIsCustom ? {} : { 'aria-hidden': true })}
          >
            {nameIsCustom ? `@${handle}` : '\u00a0'}
          </div>
        </div>
      </Link>
    </div>
  );
}
