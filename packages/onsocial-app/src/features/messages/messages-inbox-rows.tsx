'use client';

import {
  Fragment,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import type { DmThreadSummary } from '@onsocial/sdk';
import {
  Divider,
} from '@onsocial/ui';
import { StandingIdentity } from '@/components/profile/standing-identity';
import {
  formatAbsoluteDmTime,
  formatRelativeDmTime,
} from '@/features/messages/dm-time';
import type { MessagesSearchBlockReason } from '@/features/messages/messages-inbox-search';
import { useFeedWindow } from '@/features/home/use-feed-window';
import { MESSAGES_INBOX_ANCHOR_QUERY } from '@/features/home/home-feed-scroll-anchor';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import { displayName, fallbackLabel } from '@/lib/profile-display';

export function MessagesInboxList({
  children,
  'aria-label': ariaLabel,
  refreshing = false,
  skeleton = false,
  listRef,
}: {
  children: ReactNode;
  'aria-label': string;
  refreshing?: boolean;
  skeleton?: boolean;
  listRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      className={`standing-list notifications-activity-list messages-inbox-list${
        refreshing ? ' messages-inbox-list--refreshing' : ''
      }${skeleton ? ' messages-inbox-list--skeleton' : ''}`}
      role="list"
      aria-label={ariaLabel}
      aria-busy={refreshing || skeleton || undefined}
      ref={listRef}
    >
      {children}
    </div>
  );
}

function MessagesInboxSkeletonRow() {
  return (
    <div
      className="standing-row standing-row--skeleton notifications-activity-row messages-inbox-row--skeleton"
      aria-hidden
    >
      <div className="standing-row-main">
        <div className="standing-row-avatar standing-row-shimmer" />
        <div className="standing-row-copy">
          <div className="standing-row-name-row">
            <div className="standing-row-shimmer standing-row-shimmer-line" />
          </div>
          <div className="standing-row-shimmer standing-row-shimmer-line-sm" />
        </div>
      </div>
      <div className="standing-row-aside">
        <div className="standing-row-shimmer standing-row-shimmer-time" />
      </div>
    </div>
  );
}

export function MessagesInboxSkeleton({ count = 6 }: { count?: number }) {
  return (
    <MessagesInboxList aria-label="Loading conversations" skeleton>
      {Array.from({ length: count }, (_, index) => (
        <Fragment key={index}>
          {index > 0 ? <Divider variant="item" /> : null}
          <MessagesInboxSkeletonRow />
        </Fragment>
      ))}
    </MessagesInboxList>
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
  const name = displayName(peerAccountId, profileName ?? undefined);
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
            <span className="standing-row-bio">{previewLine}</span>
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
  const name = displayName(accountId, profileName ?? undefined);
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
            <span className="standing-row-bio">{previewLine}</span>
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
  refreshing = false,
  onOpenThread,
}: {
  threads: readonly DmThreadSummary[];
  ariaLabel: string;
  profiles: Record<string, PostAuthorProfile>;
  inboxPreviewByThread: Record<string, string>;
  sealedThreadIds?: ReadonlySet<string>;
  treatAllAsSealed?: boolean;
  activeThreadId?: string | null;
  refreshing?: boolean;
  onOpenThread: (threadId: string) => void;
}) {
  /*
   * List windowing — same core as the feed, thread panels, and notification
   * inbox: past the row threshold, far rows collapse into spacers so a long
   * conversation list stops paying DOM cost offscreen. The gateway list is
   * cursor-less, so every known thread is a window key. Rows are short
   * standing rows (~76px estimate); the measured cache corrects it after
   * first paint. Each list instance (main / search / sealed) windows
   * independently.
   */
  const rowKeys = useMemo(
    () => threads.map((thread) => thread.threadId),
    [threads]
  );
  const listRef = useRef<HTMLDivElement | null>(null);
  const { windowed, start, end, topSpacer, bottomSpacer, registerRow } =
    useFeedWindow({
      keys: rowKeys,
      hostRef: listRef,
      anchorQuery: MESSAGES_INBOX_ANCHOR_QUERY,
      estimate: 76,
    });

  return (
    <MessagesInboxList
      aria-label={ariaLabel}
      refreshing={refreshing}
      listRef={listRef}
    >
      {windowed && topSpacer > 0 ? (
        <div
          style={{ height: topSpacer }}
          aria-hidden="true"
          data-feed-window-spacer="top"
        />
      ) : null}
      {threads.slice(start, end).map((thread, sliceIndex) => {
        const index = start + sliceIndex;
        const sealed =
          treatAllAsSealed ||
          (sealedThreadIds?.has(thread.threadId) ?? false);
        const profile = profiles[thread.peerAccountId];
        return (
          <div
            key={thread.threadId}
            ref={registerRow(thread.threadId)}
            data-inbox-thread-key={thread.threadId}
          >
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
          </div>
        );
      })}
      {windowed && bottomSpacer > 0 ? (
        <div
          style={{ height: bottomSpacer }}
          aria-hidden="true"
          data-feed-window-spacer="bottom"
        />
      ) : null}
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
