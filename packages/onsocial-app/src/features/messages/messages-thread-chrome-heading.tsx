'use client';

import Link from 'next/link';
import { osChromeSubjectClassName } from '@onsocial/ui';
import { OsChromeSubject } from '@/components/profile/os-chrome-subject';
import { messagesThreadChromeTitle } from '@/features/messages/messages-thread-chrome';
import { portfolioPath } from '@/lib/overlay-routes';
import { displayName, fallbackLabel } from '@/lib/profile-display';

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
  const title = messagesThreadChromeTitle(name, handle);

  return (
    <Link
      href={portfolioPath(accountId)}
      className={`${osChromeSubjectClassName} messages-thread-chrome-subject`}
      scroll={false}
      title={title}
    >
      <OsChromeSubject
        accountId={accountId}
        profileName={profileName}
        avatarUrl={avatarUrl}
        showHandle
        avatarSize="sm"
        unstyled
      />
    </Link>
  );
}
