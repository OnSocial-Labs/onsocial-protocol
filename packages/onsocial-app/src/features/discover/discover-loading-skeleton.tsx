'use client';

import { ProfileSocialListSkeleton } from '@/components/panels/profile-social-list-row';

export function DiscoverTrendingChipSectionSkeleton() {
  return (
    <section className="discover-trending-section" aria-hidden>
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

export function DiscoverTrendingProfilesSectionSkeleton() {
  return (
    <section className="discover-trending-section" aria-hidden>
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
    <section className="discover-trending-section" aria-hidden>
      <div className="discover-trending-section-head">
        <span className="standing-row-shimmer standing-row-shimmer-line discover-trending-shimmer-heading" />
        <span className="standing-row-shimmer standing-row-shimmer-line discover-trending-shimmer-see-all" />
      </div>
      <DiscoverFocusListSkeleton rows={4} />
    </section>
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
