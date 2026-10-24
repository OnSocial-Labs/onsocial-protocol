'use client';

import Link from 'next/link';
import { Divider } from '@onsocial/ui';
import { standingIdentityLabel } from '@onsocial/ui';
import { StandingIdentity } from '@/components/profile/standing-identity';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import { portfolioPath } from '@/lib/overlay-routes';
import { ActivityQuantityLabel } from '@/features/scarces/quantity-count';
import { activityPriceLabel } from '@/features/scarces/quantity-count-format';

export interface CollectionActivityRow {
  key: string;
  operation: string;
  label: string;
  actor: string | null;
  time: string;
  timeTitle?: string;
  /** Unit price. A batch total is divided before it reaches this field. */
  priceNear: string | null;
  /** Copies in the event. One stays quiet on the row. */
  quantity?: number | null;
  /** The price is the same unit for every copy in the batch. */
  uniformBatch?: boolean;
}

/**
 * Standing-sale row: avatar + person left; time + amount on the opposite side
 * (same family as portfolio earnings / standing lists).
 */
export function CollectionActivityRows({
  rows,
  profiles,
}: {
  rows: CollectionActivityRow[];
  profiles: Record<string, PostAuthorProfile>;
}) {
  return (
    <div className="standing-list collection-activity-standing">
      {rows.map((row, index) => {
        const actor = row.actor?.trim() || null;
        const profile = actor ? profiles[actor] : undefined;
        const actorLabel = actor
          ? standingIdentityLabel(actor, profile?.displayName).label
          : null;

        return (
          <div key={row.key}>
            {index > 0 ? <Divider variant="item" /> : null}
            <div className="standing-row collection-activity-standing-row">
              <div className="standing-row-main">
                {actor && actorLabel ? (
                  <>
                    {/* Full-row hit like ProfileSocialListRow — circular avatar slot,
                        no rectangular link ring around the face. */}
                    <Link
                      href={portfolioPath(actor)}
                      className="standing-row-hit"
                      scroll={false}
                      aria-label={`View ${actorLabel}'s profile`}
                    />
                    <StandingIdentity
                      accountId={actor}
                      profileName={profile?.displayName}
                      avatarUrl={profile?.avatarUrl}
                    >
                      <span className="collection-activity-standing-kind">
                        <ActivityQuantityLabel
                          label={row.label}
                          quantity={row.quantity}
                        />
                      </span>
                    </StandingIdentity>
                  </>
                ) : (
                  <div className="standing-row-copy collection-activity-standing-system">
                    <span className="standing-row-name-row">
                      <span className="standing-row-name">
                        <ActivityQuantityLabel
                          label={row.label}
                          quantity={row.quantity}
                        />
                      </span>
                    </span>
                  </div>
                )}
              </div>
              <div className="standing-row-aside">
                {row.time ? (
                  <time
                    className="standing-row-time"
                    title={row.timeTitle || undefined}
                  >
                    {row.time}
                  </time>
                ) : null}
                {row.priceNear ? (
                  <span className="collection-activity-price">
                    {activityPriceLabel(
                      row.priceNear,
                      row.quantity,
                      row.uniformBatch === true
                    )}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
