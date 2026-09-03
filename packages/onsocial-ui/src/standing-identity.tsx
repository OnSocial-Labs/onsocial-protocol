'use client';

import type { ReactNode } from 'react';
import { cn } from './cn.js';
import {
  ProfileAvatar,
  type ProfileAvatarShape,
  type ProfileAvatarSize,
} from './profile-avatar.js';

export type StandingIdentityShowHandle = boolean | 'when-named';

/**
 * Label rules for standing-row account chrome (pickers + list rows).
 * Handle is the full account id (do not strip `.near` / `.testnet`).
 * When there is no custom name, the primary line is `@handle`.
 */
export function standingIdentityLabel(
  accountId: string,
  profileName?: string | null
): { name: string | null; label: string; handle: string } {
  const handle = accountId.trim();
  const name = profileName?.trim() || null;
  return { name, label: name || `@${handle}`, handle };
}

/**
 * Quiet `@handle` for hug / action sheet `copy` under a feature title
 * (Storage, Creator tokens, …). Same handle rules as {@link standingIdentityLabel}.
 */
export function standingIdentityAccountCopy(accountId: string): string {
  const { handle } = standingIdentityLabel(accountId);
  return handle ? `@${handle}` : '';
}

/**
 * Avatar + name + optional @handle cluster for standing-row chrome.
 * Parent owns `.standing-row` / `.standing-row-main` / aside / hit link.
 * Pair with `os-standing-identity.css`.
 */
export function StandingIdentity({
  accountId,
  profileName,
  avatarUrl,
  size = 'lg',
  shape = 'circle',
  showHandle = 'when-named',
  copyLeading,
  nameTrailing,
  children,
  className,
  nameRowClassName,
  avatarClassName = 'standing-row-avatar-slot',
  shellLoading = false,
}: {
  accountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  size?: ProfileAvatarSize;
  shape?: ProfileAvatarShape;
  showHandle?: StandingIdentityShowHandle;
  /** Before `.standing-row-head` inside `.standing-row-copy` (relationship signals). */
  copyLeading?: ReactNode;
  /** Inside `.standing-row-name-row` after the name (role badge, mood, status). */
  nameTrailing?: ReactNode;
  /** After `.standing-row-head` inside `.standing-row-copy` (bio, kind, metrics). */
  children?: ReactNode;
  className?: string;
  /** Extra class on `.standing-row-name-row` (e.g. guild member gap). */
  nameRowClassName?: string;
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
        shape={shape}
        className={avatarClassName}
        shellLoading={shellLoading}
      />
      <div className={cn('standing-row-copy', className)}>
        {copyLeading}
        <span className="standing-row-head">
          <span className={cn('standing-row-name-row', nameRowClassName)}>
            <span className="standing-row-name">{label}</span>
            {nameTrailing}
          </span>
          {handleVisible ? (
            <span className="standing-row-handle">
              {standingIdentityAccountCopy(handle)}
            </span>
          ) : null}
        </span>
        {children}
      </div>
    </>
  );
}
