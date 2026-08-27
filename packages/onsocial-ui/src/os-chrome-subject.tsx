'use client';

import type { ReactNode } from 'react';
import { cn } from './cn.js';
import { ProfileAvatar } from './profile-avatar.js';
import {
  standingIdentityLabel,
  type StandingIdentityShowHandle,
} from './standing-identity.js';

export const osChromeSubjectClassName = 'os-chrome-subject';

export type OsChromeSubjectShowHandle = StandingIdentityShowHandle;

/**
 * Avatar + name + optional @handle for app chrome headers and sheet identity rows.
 * Parent may wrap in Next.js `Link` with `osChromeSubjectClassName`, or pass `href`
 * for a plain anchor. Pair with `os-chrome-subject.css`.
 */
export function OsChromeSubject({
  accountId,
  profileName,
  avatarUrl,
  primaryLabel,
  handleLabel,
  showHandle = 'when-named',
  handleSlot,
  href,
  title,
  onClick,
  shellLoading = false,
  className,
  avatarClassName,
  /** Omit root — parent supplies `osChromeSubjectClassName` (e.g. Next.js Link). */
  unstyled = false,
}: {
  accountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  /** Override primary line (e.g. wallet "You", implicit-account title). */
  primaryLabel?: string;
  /** Override @handle text; defaults to full account id. */
  handleLabel?: string;
  showHandle?: OsChromeSubjectShowHandle;
  /** Replace the default muted @handle row (e.g. copy-to-clipboard control). */
  handleSlot?: ReactNode;
  href?: string;
  title?: string;
  onClick?: () => void;
  shellLoading?: boolean;
  className?: string;
  avatarClassName?: string;
  unstyled?: boolean;
}) {
  const identity = standingIdentityLabel(accountId, profileName);
  const nameLine = primaryLabel?.trim() || identity.label;
  const handle = handleLabel?.trim() || identity.handle;
  const handleVisible =
    handleSlot != null ||
    showHandle === true ||
    (showHandle === 'when-named' && Boolean(identity.name));
  const fallbackInitial = identity.name || handle;

  const copy = (
    <>
      <ProfileAvatar
        src={avatarUrl ?? null}
        fallbackInitial={fallbackInitial}
        size="md"
        shellLoading={shellLoading}
        className={cn('os-chrome-subject__avatar', avatarClassName)}
      />
      <span className="os-chrome-subject__copy">
        <span className="os-chrome-subject__name">{nameLine}</span>
        {handleVisible
          ? (handleSlot ?? (
              <span className="os-chrome-subject__handle">@{handle}</span>
            ))
          : null}
      </span>
    </>
  );

  if (unstyled) {
    return copy;
  }

  if (href) {
    return (
      <a
        href={href}
        className={cn(osChromeSubjectClassName, className)}
        title={title}
        onClick={onClick}
      >
        {copy}
      </a>
    );
  }

  return (
    <span className={cn(osChromeSubjectClassName, className)} title={title}>
      {copy}
    </span>
  );
}
