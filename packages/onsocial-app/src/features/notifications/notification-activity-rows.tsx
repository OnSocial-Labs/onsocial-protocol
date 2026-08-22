'use client';

import type { ComponentType, ReactNode } from 'react';
import {
  Divider,
  ExternalLinkIcon,
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
  notificationDetail,
  notificationExplorerHref,
  notificationSystemChrome,
  type NotificationSystemFamily,
} from '@/lib/notification-display';
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

/**
 * Hybrid Activity rows:
 * - Social (actor) → standing identity + verb
 * - System → Mage family mark + family title + action
 * Time aside; unread = green pip only; optional Nearblocks icon when on-chain.
 */
export function NotificationActivityRows({
  items,
  profiles,
  onOpen,
}: {
  items: Notification[];
  profiles: Record<string, PostAuthorProfile>;
  onOpen: (item: Notification) => void;
}) {
  return (
    <div className="standing-list notifications-activity-list" role="list">
      {items.map((item, index) => {
        const actor = item.actor?.trim() || null;
        const system = isSystemNotification(item);
        const when = formatNotificationTime(item.createdAt);
        const unread = !item.read;
        const explorerHref = notificationExplorerHref(item);

        let title: string;
        let ariaLead: string;
        let body: ReactNode;

        if (system) {
          const chrome = notificationSystemChrome(item);
          const { snippet } = notificationDetail(item);
          title = chrome.familyLabel;
          ariaLead = `${chrome.familyLabel}, ${chrome.action}`;
          body = (
            <>
              <SystemMark family={chrome.family} />
              <div className="standing-row-copy notifications-activity-system">
                <span className="standing-row-name-row">
                  <span className="standing-row-name">{chrome.familyLabel}</span>
                </span>
                <span className="notifications-activity-verb">
                  {chrome.action}
                </span>
                {snippet ? (
                  <span className="notifications-activity-snippet">
                    {snippet}
                  </span>
                ) : null}
              </div>
            </>
          );
        } else {
          const profile = actor ? profiles[actor] : undefined;
          const name = actor
            ? displayName(actor, profile?.displayName)
            : 'OnSocial';
          const identityLabel = actor
            ? standingIdentityLabel(actor, profile?.displayName).label
            : name;
          const { verb, snippet } = notificationDetail(item);
          title = identityLabel;
          ariaLead = `${identityLabel}, ${verb}`;
          body = actor ? (
            <StandingIdentity
              accountId={actor}
              profileName={profile?.displayName}
              avatarUrl={profile?.avatarUrl}
            >
              <span className="notifications-activity-verb">{verb}</span>
              {snippet ? (
                <span className="notifications-activity-snippet">{snippet}</span>
              ) : null}
            </StandingIdentity>
          ) : (
            <>
              <SystemMark family="activity" />
              <div className="standing-row-copy notifications-activity-system">
                <span className="standing-row-name-row">
                  <span className="standing-row-name">{title}</span>
                </span>
                <span className="notifications-activity-verb">{verb}</span>
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
                {when.label ? (
                  <span
                    className="standing-row-time"
                    title={when.title || undefined}
                  >
                    {when.label}
                  </span>
                ) : null}
                {explorerHref ? (
                  <a
                    className="notifications-activity-explorer"
                    href={explorerHref}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="View on Nearblocks"
                    title="View on Nearblocks"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <ExternalLinkIcon
                      className="notifications-activity-explorer-icon"
                      aria-hidden
                    />
                  </a>
                ) : null}
                {unread ? (
                  <span className="notifications-activity-pip" aria-hidden />
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
