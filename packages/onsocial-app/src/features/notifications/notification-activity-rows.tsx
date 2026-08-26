'use client';

import type { ComponentType, ReactNode } from 'react';
import {
  Divider,
  FireFillIcon,
  GiftFillIcon,
  HomeFillIcon,
  InformationCircleFillIcon,
  ShopFillIcon,
  StandingIdentity,
  StarsCFillIcon,
  UsersFillIcon,
  standingIdentityLabel,
} from '@onsocial/ui';
import type { Notification } from '@onsocial/sdk';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import {
  formatNotificationTime,
  isSystemNotification,
  notificationDaoAccountId,
  notificationDetail,
  notificationSystemChrome,
  type NotificationSystemFamily,
} from '@/lib/notification-display';
import { guildDisplayName } from '@/features/guilds/guild-card-display';
import { displayName } from '@/lib/profile-display';

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

function NotificationActivitySkeletonRow() {
  return (
    <div className="standing-row notifications-activity-row" aria-hidden>
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

function ActivityCopy({
  verb,
  place,
  snippet,
}: {
  verb: string;
  place?: string | null;
  snippet?: string | null;
}) {
  return (
    <>
      <span className="notifications-activity-verb">{verb}</span>
      {place ? (
        <span className="notifications-activity-place">{place}</span>
      ) : null}
      {snippet ? (
        <span className="notifications-activity-snippet">{snippet}</span>
      ) : null}
    </>
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
  onOpen,
}: {
  items: Notification[];
  profiles: Record<string, PostAuthorProfile>;
  guildNames?: Record<string, string>;
  onOpen: (item: Notification) => void;
}) {
  return (
    <div className="standing-list notifications-activity-list" role="list">
      {items.map((item, index) => {
        const actor = item.actor?.trim() || null;
        const daoAccountId = notificationDaoAccountId(item);
        const leadAccount =
          item.type === 'dao_proposal_resolved'
            ? daoAccountId || actor
            : actor;
        const system = !leadAccount && isSystemNotification(item);
        const when = formatNotificationTime(item.createdAt);
        const unread = !item.read;
        const {
          verb,
          placeAccountId,
          placeGroupId,
          placeCollectionId,
          snippet,
        } = notificationDetail(item);
        const placeProfile = placeAccountId
          ? profiles[placeAccountId]
          : undefined;
        const placeName = placeAccountId
          ? displayName(placeAccountId, placeProfile?.displayName)
          : placeGroupId
            ? guildNames?.[placeGroupId] ||
              guildDisplayName(null, placeGroupId)
            : placeCollectionId;

        let ariaLead: string;
        let body: ReactNode;

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
                <ActivityCopy
                  verb={chrome.action}
                  place={placeName}
                  snippet={snippet}
                />
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
            >
              <ActivityCopy
                verb={verb}
                place={placeName}
                snippet={snippet}
              />
            </StandingIdentity>
          ) : (
            <>
              <SystemMark family="activity" />
              <div className="standing-row-copy notifications-activity-system">
                <span className="standing-row-name-row">
                  <span className="standing-row-name">{identityLabel}</span>
                </span>
                <ActivityCopy verb={verb} place={placeName} snippet={snippet} />
              </div>
            </>
          );
        }

        const aria = when.label ? `${ariaLead}, ${when.label}` : ariaLead;

        return (
          <div key={item.id} role="listitem">
            {index > 0 ? <Divider variant="item" /> : null}
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
