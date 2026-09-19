'use client';

import type { ComponentType, ReactNode } from 'react';
import {
  Divider,
  FireFillIcon,
  GiftFillIcon,
  HeartFillIcon,
  HomeFillIcon,
  InformationCircleFillIcon,
  MessageFillIcon,
  NoteTextFillIcon,
  RepeatIcon,
  ShopFillIcon,
  StarMovingFillIcon,
  StarsCFillIcon,
  UserFillIcon,
  UsersFillIcon,
  standingIdentityLabel,
} from '@onsocial/ui';
import { StandingIdentity } from '@/components/profile/standing-identity';
import type { Notification } from '@onsocial/sdk';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import {
  formatNotificationTime,
  isSystemNotification,
  notificationActivityBadgeKind,
  notificationLeadAccountId,
  notificationDetail,
  notificationSnippetKey,
  notificationSnippetPostRef,
  notificationSystemChrome,
  type NotificationActivityBadgeKind,
  type NotificationSystemFamily,
} from '@/lib/notification-display';
import { guildDisplayName } from '@/features/guilds/guild-card-display';
import { PostRichText } from '@/features/home/post-rich-text';
import { ProtocolNameTrailing } from '@/features/protocol/protocol-name-trailing';
import { buildNotificationDayRows } from '@/lib/notification-day-rows';
import { displayName } from '@/lib/profile-display';
import './notification-activity-badges.css';

const ACTIVITY_BADGE_INK: Record<NotificationActivityBadgeKind, string> = {
  like: 'var(--protocol-red, #f25c5c)',
  mention: 'var(--signal-standing, #5ecf9a)',
  reply: 'var(--signal-standing, #5ecf9a)',
  quote: 'var(--signal-reputation, var(--protocol-green, #00ec97))',
  repost: 'var(--signal-reputation, var(--protocol-green, #00ec97))',
  stand: 'var(--signal-standing, #5ecf9a)',
  endorse: 'var(--signal-endorse, #dab872)',
  anniversary: 'var(--signal-endorse, #dab872)',
  support: 'var(--signal-reputation, var(--protocol-green, #00ec97))',
  invite: 'var(--signal-standing, #5ecf9a)',
  proposal: '#64748b',
  sale: 'var(--signal-reputation, var(--protocol-green, #00ec97))',
};

type FillIcon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

const SYSTEM_FAMILY_ICON: Record<NotificationSystemFamily, FillIcon> = {
  boost: FireFillIcon,
  collect: GiftFillIcon,
  dao: HomeFillIcon,
  scarces: ShopFillIcon,
  guild: UsersFillIcon,
  app: InformationCircleFillIcon,
  onsocial: StarsCFillIcon,
  activity: InformationCircleFillIcon,
};

const SOCIAL_BADGE_ICON: Record<NotificationActivityBadgeKind, FillIcon> = {
  like: HeartFillIcon,
  mention: MessageFillIcon,
  reply: MessageFillIcon,
  quote: NoteTextFillIcon,
  repost: RepeatIcon,
  stand: UserFillIcon,
  endorse: StarMovingFillIcon,
  anniversary: StarsCFillIcon,
  support: GiftFillIcon,
  invite: UsersFillIcon,
  proposal: HomeFillIcon,
  sale: ShopFillIcon,
};

function NotificationActivitySkeletonRow() {
  return (
    <div
      className="standing-row standing-row--skeleton notifications-activity-row--skeleton"
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

/** Standing-style shimmer while the inbox loads. */
export function NotificationActivitySkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="standing-list notifications-activity-list standing-list-skeleton"
      aria-busy="true"
      aria-label="Loading activity"
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index}>
          {index > 0 ? <Divider variant="item" /> : null}
          <NotificationActivitySkeletonRow />
        </div>
      ))}
    </div>
  );
}

/** Rows-only shimmer appended after painted activity during pagination. */
export function NotificationActivityAppendSkeleton({
  count = 2,
}: {
  count?: number;
}) {
  return (
    <div
      className="standing-list notifications-activity-list standing-list-skeleton notifications-activity-append-skeleton"
      data-notifications-append-skeleton
      aria-hidden
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index}>
          {index > 0 ? <Divider variant="item" /> : null}
          <NotificationActivitySkeletonRow />
        </div>
      ))}
    </div>
  );
}

function SystemMark({ family }: { family: NotificationSystemFamily }) {
  const Icon = SYSTEM_FAMILY_ICON[family];
  return (
    <span
      className={`notifications-activity-mark notifications-activity-mark--${family}`}
      aria-hidden
    >
      <Icon className="notifications-activity-mark-icon" />
    </span>
  );
}

function ActivityTypeBadge({ kind }: { kind: NotificationActivityBadgeKind }) {
  const Icon = SOCIAL_BADGE_ICON[kind];
  return (
    <span
      className={`notifications-activity-badge notifications-activity-badge--${kind}`}
      data-activity-badge={kind}
      style={{
        backgroundColor: 'var(--bg, rgb(var(--bg-rgb) / 1))',
        color: ACTIVITY_BADGE_INK[kind],
      }}
    >
      <Icon className="notifications-activity-badge-icon" />
    </span>
  );
}

function ActivityVerb({ verb }: { verb: string }) {
  return <span className="notifications-activity-verb">{verb}</span>;
}

function ActivityFeedIdentity({
  accountId,
  profileName,
}: {
  accountId: string;
  profileName?: string | null;
}) {
  const { name, handle } = standingIdentityLabel(accountId, profileName);
  return (
    <>
      <span className="post-identity-name-marks">
        <ProtocolNameTrailing accountId={accountId} />
      </span>
      {name ? (
        <span className="post-identity-handle" title={`@${handle}`}>
          @{handle}
        </span>
      ) : null}
    </>
  );
}

function ActivityHint({
  place,
  snippet,
}: {
  place?: string | null;
  snippet?: string | null;
}) {
  if (!place && !snippet) return null;
  return (
    <span className="standing-row-bio notifications-activity-snippet">
      {place ? (
        <span className="notifications-activity-place">{place}</span>
      ) : null}
      {place && snippet ? (
        <span className="standing-row-sep" aria-hidden>
          ·
        </span>
      ) : null}
      {snippet ? (
        <PostRichText text={snippet} interactive={false} emptyFallback="" />
      ) : null}
    </span>
  );
}

/**
 * Hybrid Activity rows:
 * - Social / DAO identity → standing lead + verb
 * - System → Mage family mark + family title + action
 * Time + unread pip as one aside cluster. No explorer on the list.
 */
export function NotificationActivityRows({
  items,
  profiles,
  guildNames,
  collectionNames,
  postSnippets,
  onOpen,
  refreshing = false,
}: {
  items: Notification[];
  profiles: Record<string, PostAuthorProfile>;
  guildNames?: Record<string, string>;
  collectionNames?: Record<string, string>;
  postSnippets?: Record<string, string>;
  onOpen: (item: Notification) => void;
  refreshing?: boolean;
}) {
  const rows = buildNotificationDayRows(items);

  return (
    <div
      className={`standing-list notifications-activity-list${
        refreshing ? ' notifications-activity-list--refreshing' : ''
      }`}
      role="list"
      aria-busy={refreshing || undefined}
    >
      {rows.map((row, index) => {
        if (row.kind === 'day') {
          return (
            <div
              key={row.key}
              className="notifications-activity-day"
              aria-label={row.label}
            >
              <span>{row.label}</span>
            </div>
          );
        }

        const item = row.item;
        const previous = index > 0 ? rows[index - 1] : null;
        const leadAccount = notificationLeadAccountId(item);
        const system = !leadAccount && isSystemNotification(item);
        const when = formatNotificationTime(item.createdAt);
        const unread = !item.read;
        const {
          verb,
          placeAccountId,
          placeGroupId,
          placeCollectionId,
          snippet: contextSnippet,
        } = notificationDetail(item);
        const snippetRef = notificationSnippetPostRef(item);
        const snippet =
          contextSnippet ??
          (snippetRef
            ? postSnippets?.[
                notificationSnippetKey(snippetRef.author, snippetRef.postId)
              ]
            : null);
        const placeProfile = placeAccountId
          ? profiles[placeAccountId]
          : undefined;
        const placeName = placeAccountId
          ? displayName(placeAccountId, placeProfile?.displayName)
          : placeGroupId
            ? guildNames?.[placeGroupId] ||
              guildDisplayName(null, placeGroupId)
            : placeCollectionId
              ? collectionNames?.[placeCollectionId] || placeCollectionId
              : null;

        let ariaLead: string;
        let body: ReactNode;

        const badgeKind = notificationActivityBadgeKind(item);

        if (system) {
          const chrome = notificationSystemChrome(item);
          ariaLead = `${chrome.familyLabel}, ${chrome.action}`;
          body = (
            <>
              <SystemMark family={chrome.family} />
              <div className="standing-row-copy notifications-activity-system">
                <span className="standing-row-name-row">
                  <span className="standing-row-name">{chrome.familyLabel}</span>
                </span>
                <ActivityVerb verb={chrome.action} />
                <ActivityHint place={placeName} snippet={snippet} />
              </div>
            </>
          );
        } else {
          const profile = leadAccount ? profiles[leadAccount] : undefined;
          const name = leadAccount
            ? displayName(leadAccount, profile?.displayName)
            : 'OnSocial';
          const identityLabel = leadAccount
            ? standingIdentityLabel(leadAccount, profile?.displayName).label
            : name;
          ariaLead = [identityLabel, verb, placeName].filter(Boolean).join(', ');
          body = leadAccount ? (
            <StandingIdentity
              accountId={leadAccount}
              profileName={profile?.displayName}
              avatarUrl={profile?.avatarUrl}
              showHandle={false}
              avatarBadge={
                badgeKind ? <ActivityTypeBadge kind={badgeKind} /> : null
              }
              nameTrailing={
                <ActivityFeedIdentity
                  accountId={leadAccount}
                  profileName={profile?.displayName}
                />
              }
            >
              <ActivityVerb verb={verb} />
              <ActivityHint place={placeName} snippet={snippet} />
            </StandingIdentity>
          ) : (
            <>
              <SystemMark family="activity" />
              <div className="standing-row-copy notifications-activity-system">
                <span className="standing-row-name-row">
                  <span className="standing-row-name">{identityLabel}</span>
                </span>
                <ActivityVerb verb={verb} />
                <ActivityHint place={placeName} snippet={snippet} />
              </div>
            </>
          );
        }

        const aria = when.label ? `${ariaLead}, ${when.label}` : ariaLead;

        return (
          <div key={item.id} role="listitem">
            {previous?.kind === 'item' ? <Divider variant="item" /> : null}
            <div className="standing-row notifications-activity-row">
              <div className="standing-row-main">
                <button
                  type="button"
                  className="standing-row-hit"
                  aria-label={aria}
                  onClick={() => onOpen(item)}
                />
                {body}
              </div>
              <div className="standing-row-aside">
                <span className="notifications-activity-meta">
                  {when.label ? (
                    <span
                      className="standing-row-time"
                      title={when.title || undefined}
                    >
                      {when.label}
                    </span>
                  ) : null}
                  {unread ? (
                    <span className="notifications-activity-pip" aria-hidden />
                  ) : null}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
