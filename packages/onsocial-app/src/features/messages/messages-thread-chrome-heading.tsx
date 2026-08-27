'use client';

import Link from 'next/link';
import { OsChromeSubject, osChromeSubjectClassName } from '@onsocial/ui';
import { messagesThreadChromeTitle } from '@/features/messages/messages-thread-chrome';
import {
  customDisplayName,
  displayName,
  fallbackLabel,
} from '@/lib/profile-display';

/** Peer identity in the compact glass nav (`2.35rem` band via `OsAppScreen`). */
export function MessagesThreadChromeHeading({
  accountId,
  profileName,
  avatarUrl,
}: {
  accountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
}) {
  const name = displayName(accountId, profileName ?? undefined);
  const handle = fallbackLabel(accountId);
  const customName = customDisplayName(accountId, profileName);
  const primaryLabel = customName || name;
  const title = messagesThreadChromeTitle(name, handle);

  return (
    <Link
      href={`/${accountId}`}
      className={osChromeSubjectClassName}
      scroll={false}
      title={title}
    >
      <OsChromeSubject
        accountId={accountId}
        profileName={profileName}
        avatarUrl={avatarUrl}
        primaryLabel={primaryLabel}
        handleLabel={handle}
        showHandle={Boolean(customName)}
        unstyled
      />
    </Link>
  );
}
