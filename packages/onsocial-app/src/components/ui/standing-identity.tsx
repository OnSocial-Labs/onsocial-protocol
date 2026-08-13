'use client';

import type { ReactNode } from 'react';
import { ProfileAvatar, type ProfileAvatarSize } from '@onsocial/ui';
import { fallbackLabel } from '@/lib/profile-display';

export type StandingIdentityShowHandle = boolean | 'when-named';

/**
 * Label rules shared by allowlist / royalty / door-staff / add-member pickers.
 * When there is no custom name, the primary line is `@handle` (no duplicate handle).
 */
export function standingIdentityLabel(
  accountId: string,
  profileName?: string | null
): { name: string | null; label: string; handle: string } {
  const handle = fallbackLabel(accountId);
  const name = profileName?.trim() || null;
  return { name, label: name || `@${handle}`, handle };
}

/**
 * Avatar + name + optional @handle cluster for standing-row chrome.
 * Parent owns `.standing-row` / `.standing-row-main` / aside / hit link.
 */
export function StandingIdentity({
  accountId,
  profileName,
  avatarUrl,
  size = 'lg',
  showHandle = 'when-named',
  nameTrailing,
  children,
  className,
  avatarClassName = 'standing-row-avatar-slot',
  shellLoading = false,
}: {
  accountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  size?: ProfileAvatarSize;
  showHandle?: StandingIdentityShowHandle;
  /** Inside `.standing-row-name-row` after the name (role badge, status). */
  nameTrailing?: ReactNode;
  /** After `.standing-row-head` inside `.standing-row-copy` (bio, kind). */
  children?: ReactNode;
  className?: string;
  avatarClassName?: string;
  shellLoading?: boolean;
}) {
  const { name, label, handle } = standingIdentityLabel(accountId, profileName);
  const handleVisible =
    showHandle === true || (showHandle === 'when-named' && Boolean(name));

  return (
    <>
      <ProfileAvatar
        src={avatarUrl ?? null}
        fallbackInitial={name || accountId}
        size={size}
        className={avatarClassName}
        shellLoading={shellLoading}
      />
      <span
        className={
          className ? `standing-row-copy ${className}` : 'standing-row-copy'
        }
      >
        <span className="standing-row-head">
          <span className="standing-row-name-row">
            <span className="standing-row-name">{label}</span>
            {nameTrailing}
          </span>
          {handleVisible ? (
            <span className="standing-row-handle">@{handle}</span>
          ) : null}
        </span>
        {children}
      </span>
    </>
  );
}
