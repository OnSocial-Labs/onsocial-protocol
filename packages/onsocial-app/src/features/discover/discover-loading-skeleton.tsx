'use client';

import { ProfileSocialListSkeleton } from '@/components/panels/profile-social-list-row';

export function DiscoverTrendingChipSectionSkeleton() {
  return (
    <section
      className="discover-trending-section discover-trending-section--chip-skeleton"
      aria-hidden
    >
      <div className="discover-trending-section-head">
        <span className="standing-row-shimmer standing-row-shimmer-line discover-trending-shimmer-heading" />
        <span className="standing-row-shimmer standing-row-shimmer-line discover-trending-shimmer-see-all" />
      </div>
      <div className="discover-trending-chips">
        {Array.from({ length: 5 }, (_, index) => (
          <span
            key={index}
            className="standing-row-shimmer discover-trending-chip-shimmer"
          />
        ))}
      </div>
    </section>
  );
}

export function DiscoverRecommendedPeekSkeleton() {
  return (
    <section
      className="discover-trending-section discover-recommended-peek discover-recommended-peek--pending"
      aria-hidden
    >
      <div className="discover-trending-section-head">
        <span className="standing-row-shimmer standing-row-shimmer-line discover-trending-shimmer-heading" />
      </div>
      <ProfileSocialListSkeleton rowVariant="discover" count={4} />
    </section>
  );
}

export function DiscoverTrendingProfilesSectionSkeleton() {
  return (
    <section
      className="discover-trending-section discover-trending-section--profile-skeleton"
      aria-hidden
    >
      <div className="discover-trending-section-head">
        <span className="standing-row-shimmer standing-row-shimmer-line discover-trending-shimmer-heading" />
        <span className="standing-row-shimmer standing-row-shimmer-line discover-trending-shimmer-see-all" />
      </div>
      <ProfileSocialListSkeleton rowVariant="discover" count={4} />
    </section>
  );
}

export function DiscoverTrendingGuildsSectionSkeleton() {
  return (
    <section
      className="discover-trending-section discover-trending-section--focus-skeleton"
      aria-hidden
    >
      <div className="discover-trending-section-head">
        <span className="standing-row-shimmer standing-row-shimmer-line discover-trending-shimmer-heading" />
        <span className="standing-row-shimmer standing-row-shimmer-line discover-trending-shimmer-see-all" />
      </div>
      <DiscoverFocusListSkeleton rows={4} />
    </section>
  );
}

/** DAO / guild / hub directory placeholders — same row language as the cards. */
export function DiscoverCommunityListSkeleton({
  label,
  count = 4,
}: {
  label: string;
  count?: number;
}) {
  return (
    <div
      className="community-summary-card-grid discover-community-list-skeleton"
      aria-hidden
    >
      <p className="sr-only">{label}</p>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="community-summary-card community-summary-card--grid community-summary-card--skeleton"
        >
          <span className="community-summary-media">
            <span className="standing-row-shimmer community-summary-cover-shimmer" />
          </span>
          <span className="community-summary-body">
            <span className="standing-row-shimmer standing-row-shimmer-line" />
            <span className="standing-row-shimmer standing-row-shimmer-line-sm" />
          </span>
        </div>
      ))}
    </div>
  );
}

/** Topic / ticker list placeholders. */
export function DiscoverFocusListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <ul
      className="discover-focus-rows discover-focus-rows--skeleton"
      aria-hidden
    >
      {Array.from({ length: rows }, (_, index) => (
        <li
          key={index}
          className="discover-focus-row discover-focus-row--skeleton"
        >
          <span className="standing-row-shimmer standing-row-shimmer-line discover-focus-shimmer-label" />
          <span className="standing-row-shimmer standing-row-shimmer-line discover-focus-shimmer-meta" />
        </li>
      ))}
    </ul>
  );
}
