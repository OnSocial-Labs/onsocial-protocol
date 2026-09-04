'use client';

import type { JobSearchRow } from '@onsocial/sdk';
import { profileOrgLineLabel } from '@onsocial/sdk';
import { PortfolioHiringLine } from '@/components/portfolio/portfolio-hiring-line';
import { PortfolioLocationMark } from '@/components/portfolio/portfolio-location-mark';
import { PortfolioOrgKindMark } from '@/components/portfolio/portfolio-org-kind-mark';

/** One quiet org meta row: industry · location · Hiring. */
export function PortfolioOrgMetaLine({
  accountId,
  orgName,
  industry,
  location,
  initialJobs = [],
}: {
  accountId: string;
  orgName: string;
  industry?: string | null;
  location?: string | null;
  initialJobs?: JobSearchRow[];
}) {
  const locationLabel = location?.trim() || null;

  return (
    <div className="portfolio-location portfolio-org-meta" data-profile-kind-line="org">
      <span className="portfolio-org-meta-part">
        <PortfolioOrgKindMark />
        <span>{profileOrgLineLabel(industry)}</span>
      </span>
      {locationLabel ? (
        <>
          <span className="portfolio-org-meta-sep" aria-hidden>
            ·
          </span>
          <span className="portfolio-org-meta-part">
            <PortfolioLocationMark />
            <span>{locationLabel}</span>
          </span>
        </>
      ) : null}
      <PortfolioHiringLine
        accountId={accountId}
        orgName={orgName}
        initialJobs={initialJobs}
        variant="inline"
      />
    </div>
  );
}
