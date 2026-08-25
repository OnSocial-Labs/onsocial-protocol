'use client';

import { Fragment, type ReactNode } from 'react';
import type { DmThreadSummary } from '@onsocial/sdk';
import { Divider, StandingIdentity } from '@onsocial/ui';
import {
  formatAbsoluteDmTime,
  formatRelativeDmTime,
} from '@/features/messages/dm-time';
import type { MessagesSearchBlockReason } from '@/features/messages/messages-inbox-search';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import { displayName, fallbackLabel } from '@/lib/profile-display';

export function MessagesInboxList({
  children,
  'aria-label': ariaLabel,
}: {
  children: ReactNode;
  'aria-label': string;
}) {
  return (
    <div
      className="standing-list notifications-activity-list messages-inbox-list"
      role="list"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}

export function MessagesInboxThreadRow({
  peerAccountId,
  profileName,
  avatarUrl,
  preview,
  sealed = false,
  lastMessageAt,
  unread = false,
  active = false,
  onOpen,
}: {
  peerAccountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  preview?: string | null;
  sealed?: boolean;
  lastMessageAt: string;
  unread?: boolean;
  active?: boolean;
  onOpen: () => void;
}) {
  const name = displayName(peerAccountId, profileName);
  const handle = fallbackLabel(peerAccountId);
  const relative = formatRelativeDmTime(lastMessageAt);
  const absolute = formatAbsoluteDmTime(lastMessageAt);
  const previewLine = sealed
    ? name !== handle
      ? `@${handle} · sealed`
      : 'Sealed before reset'
    : preview?.trim() || null;
  const ariaLead = [name, previewLine, relative].filter(Boolean).join(', ');

  return (
    <div
      className={`standing-row notifications-activity-row messages-inbox-row${
        active ? ' is-active' : ''
      }`}
      role="listitem"
    >
      <div className="standing-row-main">
        <button
          type="button"
          className="standing-row-hit"
          aria-label={ariaLead}
          onClick={onOpen}
        />
        <StandingIdentity
          accountId={peerAccountId}
          profileName={profileName}
          avatarUrl={avatarUrl}
        >
          {previewLine ? (
            <span className="notifications-activity-snippet">{previewLine}</span>
          ) : null}
        </StandingIdentity>
      </div>
      <div className="standing-row-aside">
        {relative ? (
          <time
            className="standing-row-time"
            dateTime={lastMessageAt}
            title={absolute || undefined}
          >
            {relative}
          </time>
        ) : null}
        {unread ? (
          <span className="notifications-activity-pip" aria-label="Unread" />
        ) : null}
      </div>
    </div>
  );
}

export function MessagesInboxPeopleRow({
  accountId,
  profileName,
  avatarUrl,
  description,
  disabled = false,
  onOpen,
}: {
  accountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  description?: string | null;
  disabled?: boolean;
  onOpen?: () => void;
}) {
  const name = displayName(accountId, profileName);
  const previewLine = description?.trim() || null;
  const ariaLead = [name, previewLine].filter(Boolean).join(', ');

  return (
    <div
      className={`standing-row notifications-activity-row messages-inbox-row messages-inbox-row--person${
        disabled ? ' is-disabled' : ''
      }`}
      role="listitem"
    >
      <div className="standing-row-main">
        {disabled ? null : (
          <button
            type="button"
            className="standing-row-hit"
            aria-label={ariaLead}
            onClick={onOpen}
          />
        )}
        <StandingIdentity
          accountId={accountId}
          profileName={profileName}
          avatarUrl={avatarUrl}
        >
          {previewLine ? (
            <span className="notifications-activity-snippet">{previewLine}</span>
          ) : null}
        </StandingIdentity>
      </div>
    </div>
  );
}

export function MessagesInboxThreadRows({
  threads,
  ariaLabel,
  profiles,
  inboxPreviewByThread,
  sealedThreadIds,
  treatAllAsSealed = false,
  activeThreadId,
  onOpenThread,
}: {
  threads: readonly DmThreadSummary[];
  ariaLabel: string;
  profiles: Record<string, PostAuthorProfile>;
  inboxPreviewByThread: Record<string, string>;
  sealedThreadIds?: ReadonlySet<string>;
  treatAllAsSealed?: boolean;
  activeThreadId?: string | null;
  onOpenThread: (threadId: string) => void;
}) {
  return (
    <MessagesInboxList aria-label={ariaLabel}>
      {threads.map((thread, index) => {
        const sealed =
          treatAllAsSealed ||
          (sealedThreadIds?.has(thread.threadId) ?? false);
        const profile = profiles[thread.peerAccountId];
        return (
          <Fragment key={thread.threadId}>
            {index > 0 ? <Divider variant="item" /> : null}
            <MessagesInboxThreadRow
              peerAccountId={thread.peerAccountId}
              profileName={profile?.displayName}
              avatarUrl={profile?.avatarUrl}
              preview={inboxPreviewByThread[thread.threadId]}
              sealed={sealed}
              lastMessageAt={thread.lastMessageAt}
              unread={sealed ? false : thread.unread}
              active={thread.threadId === activeThreadId}
              onOpen={() => onOpenThread(thread.threadId)}
            />
          </Fragment>
        );
      })}
    </MessagesInboxList>
  );
}

export function MessagesInboxPeopleRows({
  people,
  ariaLabel,
  isBlocked,
  blockedCopy,
  onOpenPerson,
}: {
  people: readonly {
    accountId: string;
    name?: string | null;
    avatarUrl?: string | null;
  }[];
  ariaLabel: string;
  isBlocked: (accountId: string) => MessagesSearchBlockReason | null;
  blockedCopy: (reason: MessagesSearchBlockReason | null) => string | null;
  onOpenPerson: (accountId: string) => void;
}) {
  return (
    <MessagesInboxList aria-label={ariaLabel}>
      {people.map((person, index) => {
        const blocked = isBlocked(person.accountId);
        return (
          <Fragment key={person.accountId}>
            {index > 0 ? <Divider variant="item" /> : null}
            <MessagesInboxPeopleRow
              accountId={person.accountId}
              profileName={person.name}
              avatarUrl={person.avatarUrl}
              description={blockedCopy(blocked)}
              disabled={Boolean(blocked)}
              onOpen={
                blocked ? undefined : () => onOpenPerson(person.accountId)
              }
            />
          </Fragment>
        );
      })}
    </MessagesInboxList>
  );
}
