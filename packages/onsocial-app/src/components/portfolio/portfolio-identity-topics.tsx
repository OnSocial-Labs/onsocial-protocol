'use client';

import Link from 'next/link';
import { homeHashtagPath } from '@/features/home/home-hashtag-search';
import {
  profileIdentityTopicLabel,
  profileIdentityTopics,
} from '@/lib/profile-identity-topics';

/** Quiet craft line under the handle — no `#`. Empty list hides. */
export function PortfolioIdentityTopics({ tags }: { tags?: unknown }) {
  const topics = profileIdentityTopics(tags);
  if (topics.length === 0) return null;

  return (
    <nav className="portfolio-topics" aria-label="Topics">
      {topics.map((slug, index) => (
        <span key={slug} className="portfolio-topics-item">
          {index > 0 ? (
            <span className="portfolio-topics-sep" aria-hidden>
              ·
            </span>
          ) : null}
          <Link
            href={homeHashtagPath(slug)}
            className="portfolio-topics-link"
            scroll={false}
          >
            {profileIdentityTopicLabel(slug)}
          </Link>
        </span>
      ))}
    </nav>
  );
}
