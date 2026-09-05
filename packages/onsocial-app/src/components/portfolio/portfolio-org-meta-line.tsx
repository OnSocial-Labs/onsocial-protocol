'use client';

import type { JobSearchRow } from '@onsocial/sdk';
import { PortfolioHiringLine } from '@/components/portfolio/portfolio-hiring-line';
import { PortfolioLocationMark } from '@/components/portfolio/portfolio-location-mark';
import { PortfolioOrgKindMark } from '@/components/portfolio/portfolio-org-kind-mark';

/** One quiet house meta row: industry · location · optional Hiring. */
export function PortfolioOrgMetaLine({
  accountId,
  orgName,
  industry,
  location,
  initialJobs = [],
  showHiring = true,
  emptyIndustryLabel = 'Organization',
  kindLine = 'org',
}: {
  accountId: string;
  orgName: string;
  industry?: string | null;
  location?: string | null;
  initialJobs?: JobSearchRow[];
  showHiring?: boolean;
  /** When null, hide the industry part until they set one (DAO). */
  emptyIndustryLabel?: string | null;
  kindLine?: 'org' | 'dao';
}) {
  const locationLabel = location?.trim() || null;
  const industryLabel = industry?.trim() || emptyIndustryLabel || null;

  if (!industryLabel && !locationLabel && !showHiring) return null;

  return (
    <div
      className="portfolio-location portfolio-org-meta"
      data-profile-kind-line={kindLine}
    >
      {industryLabel ? (
        <span className="portfolio-org-meta-part">
          {kindLine === 'org' ? <PortfolioOrgKindMark /> : null}
          <span>{industryLabel}</span>
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
