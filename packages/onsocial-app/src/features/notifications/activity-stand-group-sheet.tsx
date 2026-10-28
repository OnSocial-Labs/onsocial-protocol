'use client';

import Link from 'next/link';
import { Divider, OsHugSheet, standingIdentityLabel } from '@onsocial/ui';
import type { Notification } from '@onsocial/sdk';
import { StandingIdentity } from '@/components/profile/standing-identity';
import { ProtocolNameTrailing } from '@/features/protocol/protocol-name-trailing';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import { formatDmDaySeparator } from '@/features/messages/dm-time';
import { formatNotificationTime } from '@/lib/notification-display';
import { portfolioPath } from '@/lib/overlay-routes';
import { SHEET_Z } from '@/lib/sheet-z';

/**
 * Who stood the same day. Newest first, with the Activity clock.
 * A single stand never reaches this sheet.
 */
export function ActivityStandGroupSheet({
  items,
  profiles,
  onClose,
}: {
  items: Notification[] | null;
  profiles: Record<string, PostAuthorProfile>;
  onClose: () => void;
}) {
  const people = (items ?? []).filter((item) => item.actor?.trim());
  const day = people[0] ? formatDmDaySeparator(people[0].createdAt) : '';

  return (
    <OsHugSheet
      open={people.length > 1}
      onClose={onClose}
      label="Stood with you"
      {...(day ? { copy: day } : {})}
      closeAriaLabel="Close stands"
      backdropLabel="Close stands"
      zIndex={SHEET_Z.list}
      panelClassName="os-sheet-cap-standard"
    >
      <div className="standing-list notifications-activity-list" role="list">
        {people.map((item, index) => {
          const accountId = item.actor?.trim() ?? '';
          const profile = profiles[accountId];
          const when = formatNotificationTime(item.createdAt);
          const { name, label, handle } = standingIdentityLabel(
            accountId,
            profile?.displayName
          );
          const aria = when.label ? `${label}, ${when.label}` : label;
          return (
            <div key={item.id} role="listitem">
              {index > 0 ? <Divider variant="item" /> : null}
              <div className="standing-row notifications-activity-row">
                <div className="standing-row-main">
                  <Link
                    href={portfolioPath(accountId)}
                    className="standing-row-hit"
                    scroll={false}
                    aria-label={aria}
                    onClick={onClose}
                  />
                  <StandingIdentity
                    accountId={accountId}
                    profileName={profile?.displayName}
                    avatarUrl={profile?.avatarUrl}
                    showHandle={false}
                    nameTrailing={
                      <>
                        <span className="post-identity-name-marks">
                          <ProtocolNameTrailing accountId={accountId} />
                        </span>
                        {name ? (
                          <span
                            className="post-identity-handle"
                            title={`@${handle}`}
                          >
                            @{handle}
                          </span>
                        ) : null}
                      </>
                    }
                  />
                </div>
                <div className="standing-row-aside">
                  <span className="notifications-activity-meta">
                    {when.label ? (
                      <time
                        className="standing-row-time"
                        dateTime={item.createdAt}
                        title={when.title || undefined}
                      >
                        {when.label}
                      </time>
                    ) : null}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </OsHugSheet>
  );
}
