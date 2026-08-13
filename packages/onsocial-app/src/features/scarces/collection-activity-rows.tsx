'use client';

import Link from 'next/link';
import { Divider } from '@onsocial/ui';
import {
  StandingIdentity,
  standingIdentityLabel,
} from '@/components/ui/standing-identity';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import { portfolioPath } from '@/lib/overlay-routes';

export interface CollectionActivityRow {
  key: string;
  operation: string;
  label: string;
  actor: string | null;
  time: string;
  priceNear: string | null;
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

        return (
          <div key={row.key}>
            {index > 0 ? <Divider variant="item" /> : null}
            <div className="standing-row collection-activity-standing-row">
              <div className="standing-row-main">
                {actor ? (
                  <>
                    {/* Full-row hit like ProfileSocialListRow — circular avatar slot,
                        no rectangular link ring around the face. */}
                    <Link
                      href={portfolioPath(actor)}
                      className="standing-row-hit"
                      scroll={false}
                      aria-label={`View ${
                        profile?.displayName?.trim() || `@${actor}`
                      }'s profile`}
                    />
                    <StandingIdentity
                      accountId={actor}
                      profileName={profile?.displayName}
                      avatarUrl={profile?.avatarUrl}
                    >
                      <span className="collection-activity-standing-kind">
                        {row.label}
                      </span>
                    </StandingIdentity>
                  </>
                ) : (
                  <div className="standing-row-copy collection-activity-standing-system">
                    <span className="standing-row-name-row">
                      <span className="standing-row-name">{row.label}</span>
                    </span>
                  </div>
                )}
              </div>
              <div className="standing-row-aside">
                {row.time ? (
                  <span className="standing-row-time">{row.time}</span>
                ) : null}
                {row.priceNear ? (
                  <span className="portfolio-support-collect-info-amount">
                    {row.priceNear} NEAR
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
