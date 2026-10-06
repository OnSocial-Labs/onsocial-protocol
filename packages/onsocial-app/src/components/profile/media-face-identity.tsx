'use client';

import type { MouseEvent } from 'react';
import type { ProfileKind } from '@onsocial/sdk';
import type { ProfileAvatarSize } from '@onsocial/ui';
import { AccountPlaceLink } from '@/components/portfolio/account-place-link';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { ProtocolNameTrailing } from '@/features/protocol/protocol-name-trailing';
import { portfolioPath } from '@/lib/overlay-routes';
import { displayName } from '@/lib/profile-display';

/**
 * Shared face link: avatar, name, and full `@id`.
 * Same cluster as the article author line — the whole face opens the profile.
 */
export function MediaFaceIdentity({
  accountId,
  profileName,
  avatarUrl,
  href,
  size = 'lg',
  kind,
  className,
  onClick,
}: {
  accountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  /** Defaults to the account's portfolio face. */
  href?: string;
  size?: ProfileAvatarSize;
  kind?: ProfileKind | null;
  className?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const name = displayName(accountId, profileName);
  return (
    <AccountPlaceLink
      href={href ?? portfolioPath(accountId)}
      className={['os-media-face-identity', className]
        .filter(Boolean)
        .join(' ')}
      aria-label={`View ${name}'s profile`}
      onClick={onClick}
    >
      <AccountAvatar
        accountId={accountId}
        kind={kind}
        src={avatarUrl ?? null}
        fallbackInitial={name}
        size={size}
        className="post-card-avatar"
      />
      <span className="os-media-face-identity-copy">
        <span className="os-media-face-identity-name-row">
          <span className="os-media-face-identity-name">{name}</span>
          <span className="post-identity-name-marks">
            <ProtocolNameTrailing accountId={accountId} />
          </span>
        </span>
        <span className="os-media-face-identity-handle">@{accountId}</span>
      </span>
    </AccountPlaceLink>
  );
}
