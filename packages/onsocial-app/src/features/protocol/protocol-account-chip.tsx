'use client';

import Link from 'next/link';
import {
  Box3dIcon,
  formatNearAccountFallbackTitle,
  ProfileAvatar,
  UserIcon,
  type GovernanceAccountSubjectKind,
} from '@onsocial/ui';
import { protocolAccountHue } from '@/features/protocol/protocol-account-hue';
import { ProtocolNameTrailing } from '@/features/protocol/protocol-name-trailing';
import { fallbackLabel } from '@/lib/profile-display';

function hasSocialProfile(
  profileName?: string | null,
  avatarUrl?: string | null
): boolean {
  return Boolean(profileName?.trim() || avatarUrl?.trim());
}

/**
 * Compact account chip for protocol proposal cards — avatar + primary label.
 * Without a social profile, uses Mage user / box-3d icons instead of initials.
 * Protocol membership marks soft-fill next to the name (gov + treasury).
 */
export function ProtocolAccountChip({
  accountId,
  profileName,
  avatarUrl,
  dense = false,
  href,
  subjectKind = 'person',
}: {
  accountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  dense?: boolean;
  href?: string | null;
  /** @deprecated Unused — soft-fill memberships replace single-DAO role marks. */
  protocolRoleId?: string | null;
  subjectKind?: GovernanceAccountSubjectKind;
}) {
  const socialProfile = hasSocialProfile(profileName, avatarUrl);
  const hue = protocolAccountHue(accountId);
  const title =
    profileName?.trim() || formatNearAccountFallbackTitle(accountId);
  const handle = fallbackLabel(accountId);
  const resolvedHref =
    subjectKind === 'infrastructure' && !socialProfile ? null : href;
  const FallbackIcon =
    subjectKind === 'infrastructure' ? Box3dIcon : UserIcon;

  const avatar = socialProfile ? (
    <ProfileAvatar
      src={avatarUrl ?? null}
      fallbackInitial={profileName || accountId}
      size="sm"
      className={`protocol-account-chip-avatar is-hue-${hue}${
        dense ? ' is-dense' : ''
      }`}
    />
  ) : (
    <span
      className={`protocol-account-chip-icon-slot${
        dense ? ' is-dense' : ''
      }`}
      aria-hidden
    >
      <FallbackIcon className="protocol-account-chip-icon" />
    </span>
  );

  const body = (
    <>
      {avatar}
      <span className="protocol-account-chip-copy">
        <span className="protocol-account-chip-name-row">
          <span className="protocol-account-chip-name">{title}</span>
          <ProtocolNameTrailing
            accountId={accountId}
            softFill={subjectKind === 'person'}
          />
        </span>
        <span className="protocol-account-chip-handle">@{handle}</span>
      </span>
    </>
  );

  if (resolvedHref) {
    return (
      <Link
        href={resolvedHref}
        className={`protocol-account-chip${dense ? ' is-dense' : ''}`}
      >
        {body}
      </Link>
    );
  }

  return (
    <span className={`protocol-account-chip${dense ? ' is-dense' : ''}`}>
      {body}
    </span>
  );
}
