'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  discoverCraftPath,
  discoverIndustryPath,
} from '@/lib/discover-profiles';
import { profileIdentityTopics } from '@/lib/profile-identity-topics';
import { useCraftLabel, useIndustryLabel } from '@/lib/use-profile-taxonomy';

/** House sector on About — same slot as crafts, opens Orgs or DAOs Discover. */
export function PortfolioAboutIndustry({
  industry,
  kind,
}: {
  industry?: string | null;
  /** Omit on the editor twin — live About always passes org / dao. */
  kind?: 'org' | 'dao' | null;
}) {
  const t = useTranslations('shell');
  const industryName = useIndustryLabel();
  const label = industry?.trim() || null;
  if (!label) return null;
  const shown = industryName(label);

  const href = kind ? discoverIndustryPath(label, kind) : null;

  return (
    <p className="portfolio-topics" aria-label={t('discover.industry')}>
      <span className="portfolio-topics-item">
        {href ? (
          <Link href={href} className="portfolio-topics-link" scroll={false}>
            {shown}
          </Link>
        ) : (
          <span className="portfolio-topics-label">{shown}</span>
        )}
      </span>
    </p>
  );
}

/** Quiet craft line — taps open people Discover for that craft. */
export function PortfolioIdentityTopics({ tags }: { tags?: unknown }) {
  const t = useTranslations('shell');
  const craftName = useCraftLabel();
  const topics = profileIdentityTopics(tags);
  if (topics.length === 0) return null;

  return (
    <nav className="portfolio-topics" aria-label={t('taxonomy.sectionCrafts')}>
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
            {craftName(slug)}
          </Link>
        </span>
      ))}
    </nav>
  );
}
