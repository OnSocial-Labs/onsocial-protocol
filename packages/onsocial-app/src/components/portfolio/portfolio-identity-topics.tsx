'use client';

import Link from 'next/link';
import { discoverCraftPath } from '@/lib/discover-profiles';
import {
  profileIdentityTopicLabel,
  profileIdentityTopics,
} from '@/lib/profile-identity-topics';

/** Quiet craft line — taps open people Discover for that craft. */
export function PortfolioIdentityTopics({ tags }: { tags?: unknown }) {
  const topics = profileIdentityTopics(tags);
  if (topics.length === 0) return null;

  return (
    <nav className="portfolio-topics" aria-label="Crafts">
      {topics.map((slug, index) => (
        <span key={slug} className="portfolio-topics-item">
          {index > 0 ? (
            <span className="portfolio-topics-sep" aria-hidden>
              ·
            </span>
          ) : null}
          <Link
            href={discoverCraftPath(slug)}
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
