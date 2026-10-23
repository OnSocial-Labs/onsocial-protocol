'use client';

import { useState } from 'react';
import type { JobSearchRow, OfferRecord, ProfileKind } from '@onsocial/sdk';
import { ProfileJobsEditor } from '@/components/profile/profile-jobs-editor';
import { ProfileOffersEditor } from '@/components/profile/profile-offers-editor';
import { PortfolioHiringSheet } from '@/components/portfolio/portfolio-hiring-sheet';
import { PortfolioOffersSheet } from '@/components/portfolio/portfolio-offer-sheet';
import { SHEET_Z } from '@/lib/sheet-z';

/**
 * Same drawers as the profile meta line. Visitors get the offer and hiring
 * sheets. The owner gets the editors, with the visitor sheet as preview.
 */
export function DiscoverDirectoryDrawers({
  accountId,
  profileName,
  kind,
  offersOpen,
  hiringOpen,
  offers,
  jobs,
  onOffersOpenChange,
  onHiringOpenChange,
  isOwner,
}: {
  accountId: string;
  profileName: string;
  kind: ProfileKind | null;
  offersOpen: boolean;
  hiringOpen: boolean;
  offers: OfferRecord[];
  jobs: JobSearchRow[];
  onOffersOpenChange: (open: boolean) => void;
  onHiringOpenChange: (open: boolean) => void;
  isOwner: boolean;
}) {
  const [offersPreview, setOffersPreview] = useState(false);
  const [hiringPreview, setHiringPreview] = useState(false);

  if (!offersOpen && offersPreview) setOffersPreview(false);
  if (!hiringOpen && hiringPreview) setHiringPreview(false);

  return (
    <>
      {isOwner ? (
        <>
          <ProfileOffersEditor
            accountId={accountId}
            kind={kind}
            sheetOnly
            open={offersOpen}
            onOpenChange={onOffersOpenChange}
            onPreviewVisitors={
              offers.length > 0 ? () => setOffersPreview(true) : undefined
            }
          />
          <PortfolioOffersSheet
            open={offersPreview}
            onClose={() => setOffersPreview(false)}
            offers={offers}
            profileName={profileName}
            accountId={accountId}
            zIndex={SHEET_Z.overlayNested}
          />
          <ProfileJobsEditor
            accountId={accountId}
            sheetOnly
            open={hiringOpen}
            onOpenChange={onHiringOpenChange}
            onPreviewVisitors={
              jobs.length > 0 ? () => setHiringPreview(true) : undefined
            }
          />
          <PortfolioHiringSheet
            open={hiringPreview}
            onClose={() => setHiringPreview(false)}
            orgName={profileName}
            jobs={jobs}
            zIndex={SHEET_Z.overlayNested}
          />
        </>
      ) : (
        <>
          <PortfolioOffersSheet
            open={offersOpen}
            onClose={() => onOffersOpenChange(false)}
            offers={offers}
            profileName={profileName}
            accountId={accountId}
          />
          <PortfolioHiringSheet
            open={hiringOpen}
            onClose={() => onHiringOpenChange(false)}
            orgName={profileName}
            jobs={jobs}
          />
        </>
      )}
    </>
  );
}
