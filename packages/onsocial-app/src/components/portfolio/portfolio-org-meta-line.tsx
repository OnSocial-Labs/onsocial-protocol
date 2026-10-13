'use client';

import Link from 'next/link';
import type { JobSearchRow } from '@onsocial/sdk';
import { PortfolioHiringLine } from '@/components/portfolio/portfolio-hiring-line';
import { PortfolioLocationMark } from '@/components/portfolio/portfolio-location-mark';
import { PortfolioOffersLine } from '@/components/portfolio/portfolio-offers-line';
import { PortfolioOrgKindMark } from '@/components/portfolio/portfolio-org-kind-mark';
import { discoverIndustryPath } from '@/lib/discover-profiles';
import type { ResolvedMood } from '@/lib/moods/types';

/** One quiet house meta row: industry · location · Offers · Hiring. */
export function PortfolioOrgMetaLine({
  accountId,
  orgName,
  industry,
  location,
  initialJobs = [],
  showHiring = true,
  showOffers = true,
  emptyIndustryLabel = 'Organization',
  kindLine = 'org',
  mood = null,
}: {
  accountId: string;
  orgName: string;
  industry?: string | null;
  location?: string | null;
  initialJobs?: JobSearchRow[];
  showHiring?: boolean;
  showOffers?: boolean;
  /** When null, hide the industry part until they set one (DAO). */
  emptyIndustryLabel?: string | null;
  kindLine?: 'org' | 'dao';
  mood?: ResolvedMood | null;
}) {
  const locationLabel = location?.trim() || null;
  const setIndustry = industry?.trim() || null;
  const industryLabel = setIndustry || emptyIndustryLabel || null;
  const industryHref = setIndustry
    ? discoverIndustryPath(setIndustry, kindLine)
    : null;

  if (!industryLabel && !locationLabel && !showHiring && !showOffers) {
    return null;
  }

  return (
    <div
      className="portfolio-location portfolio-org-meta"
      data-profile-kind-line={kindLine}
    >
      {industryLabel ? (
        <span className="portfolio-org-meta-part">
          {kindLine === 'org' ? <PortfolioOrgKindMark /> : null}
          {industryHref ? (
            <Link
              href={industryHref}
              className="portfolio-org-meta-industry"
              scroll={false}
            >
              {industryLabel}
            </Link>
          ) : (
            <span>{industryLabel}</span>
          )}
        </span>
      ) : null}
      {industryLabel && locationLabel ? (
        <span className="portfolio-org-meta-sep" aria-hidden>
          ·
        </span>
      ) : null}
      {locationLabel ? (
        <span className="portfolio-org-meta-part">
          <PortfolioLocationMark />
          <span>{locationLabel}</span>
        </span>
      ) : null}
      {showOffers ? (
        <PortfolioOffersLine
          accountId={accountId}
          profileName={orgName}
          mood={mood}
          kind={kindLine}
          variant="inline"
          leadingSep={Boolean(industryLabel || locationLabel)}
        />
      ) : null}
      {showHiring ? (
        <PortfolioHiringLine
          accountId={accountId}
          orgName={orgName}
          initialJobs={initialJobs}
          variant="inline"
        />
      ) : null}
    </div>
  );
}
