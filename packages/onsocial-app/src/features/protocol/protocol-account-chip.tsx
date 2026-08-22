'use client';

import Link from 'next/link';
import { ProfileAvatar } from '@onsocial/ui';
import { protocolAccountHue } from '@/features/protocol/protocol-account-hue';
import type { ProtocolCouncilGuardianRoleId } from '@/features/protocol/protocol-council-guardian';
import { ProtocolCouncilGuardianMark } from '@/features/protocol/protocol-council-guardian-mark';
import { fallbackLabel } from '@/lib/profile-display';

/**
 * Compact account chip for protocol proposal cards — avatar + primary label.
 * Missing avatars use a hash-colored soft wash (App placeholders).
 */
export function ProtocolAccountChip({
  accountId,
  profileName,
  avatarUrl,
  dense = false,
  href,
  protocolRoleId = null,
}: {
  accountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  dense?: boolean;
  href?: string | null;
  protocolRoleId?: ProtocolCouncilGuardianRoleId | null;
}) {
  const hue = protocolAccountHue(accountId);
  const label = profileName?.trim() || `@${fallbackLabel(accountId)}`;
  const handle = fallbackLabel(accountId);
  const showHandle = Boolean(profileName?.trim());

  const body = (
    <>
      <ProfileAvatar
        src={avatarUrl ?? null}
        fallbackInitial={profileName || accountId}
        size="sm"
        className={`protocol-account-chip-avatar is-hue-${hue}${
          dense ? ' is-dense' : ''
        }`}
      />
      <span className="protocol-account-chip-copy">
        <span className="protocol-account-chip-name-row">
          <span className="protocol-account-chip-name">{label}</span>
          <ProtocolCouncilGuardianMark roleId={protocolRoleId} />
        </span>
        {showHandle ? (
          <span className="protocol-account-chip-handle">@{handle}</span>
        ) : null}
      </span>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
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
