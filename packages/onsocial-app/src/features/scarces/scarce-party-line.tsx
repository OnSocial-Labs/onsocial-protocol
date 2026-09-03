'use client';

import Link from 'next/link';
import { AccountAvatar } from '@/components/profile/account-avatar';
import {
  arePostAuthorProfilesResolved,
  usePostAuthorProfiles,
} from '@/hooks/use-post-author-profiles';
import { portfolioPath } from '@/lib/overlay-routes';
import { displayName, fallbackLabel } from '@/lib/profile-display';

function PartyFaceSkeleton() {
  return (
    <>
      <AccountAvatar
        size="sm"
        shellLoading
        className="scarce-buy-party-avatar"
      />
      <div className="scarce-buy-party-text">
        <span
          className="standing-row-shimmer scarce-buy-party-skel-name"
          aria-hidden
        />
        <span
          className="standing-row-shimmer scarce-buy-party-skel-handle"
          aria-hidden
        />
      </div>
    </>
  );
}

/** Author / Seller / offer party — face + name + @handle. */
export function ScarcePartyLine({
  label,
  accountId,
  displayNameValue,
  avatarUrl,
  pending = false,
}: {
  /** Role label (Author / Seller). Omit on offer rows. */
  label?: string | null;
  accountId?: string | null;
  displayNameValue?: string | null;
  avatarUrl?: string | null;
  /** Mint creator still unknown — shimmer, don’t borrow the seller. */
  pending?: boolean;
}) {
  const id = accountId?.trim() || '';
  const wait = pending || !id;
  const profiles = usePostAuthorProfiles(wait ? [] : [id]);
  const shellResolved = wait ? false : arePostAuthorProfilesResolved([id]);
  const profile = wait ? undefined : profiles[id];
  const src = avatarUrl?.trim() || profile?.avatarUrl || null;
  const profileName =
    displayNameValue?.trim() || profile?.displayName?.trim() || null;
  const handle = wait ? '' : fallbackLabel(id);
  const name = wait ? '' : displayName(id, profileName ?? undefined);
  const nameIsCustom =
    Boolean(name) && name.toLowerCase() !== handle.toLowerCase();
  const role = label?.trim() || '';
  const shellLoading = !wait && !src && !shellResolved;
  const showNameSkeleton = wait || (!profileName && !shellResolved);

  const face = showNameSkeleton ? (
    <PartyFaceSkeleton />
  ) : (
    <>
      <AccountAvatar
        accountId={id}
        kind={profile?.kind}
        src={src}
        size="sm"
        fallbackInitial={handle}
        shellLoading={shellLoading}
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
    </>
  );

  return (
    <div className="scarce-buy-author-line">
      {role ? <span className="scarce-buy-author-label">{role}</span> : null}
      {wait ? (
        <div className="scarce-buy-party" aria-hidden>
          {face}
        </div>
      ) : (
        <Link
          href={portfolioPath(id)}
          scroll={false}
          className="scarce-buy-party"
          aria-label={`@${handle}`}
        >
          {face}
        </Link>
      )}
    </div>
  );
}
