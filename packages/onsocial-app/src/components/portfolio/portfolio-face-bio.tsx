'use client';

import { useState } from 'react';
import { OsHugSheet } from '@onsocial/ui';
import { PortfolioBioBlocks } from '@/components/portfolio/portfolio-bio-blocks';
import { profileAboutBlocks } from '@/lib/profile-bio-rich';
import {
  daoFaceBioOverflows,
  profileBioFace,
} from '@/lib/profile-bio-face';
import { SHEET_Z } from '@/lib/sheet-z';

export function PortfolioFaceBio({
  text,
  fullText = null,
  title,
}: {
  text: string;
  /** Full purpose / bio. When longer than the face, ellipsis opens a hug. */
  fullText?: string | null;
  title?: string | null;
}) {
  const faceText = profileBioFace(text);
  const full = fullText?.trim() || '';
  const expandable = Boolean(full && daoFaceBioOverflows(full, faceText));
  const [open, setOpen] = useState(false);
  if (!faceText || profileAboutBlocks(faceText).length === 0) return null;

  return (
    <>
      <div className="portfolio-bio-face-slot">
        <div className="portfolio-bio portfolio-bio--face">
          <PortfolioBioBlocks text={faceText} headingAs="p" />
        </div>
        {expandable ? (
          <button
            type="button"
            className="portfolio-bio-expand"
            aria-label="Read full bio"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            …
          </button>
        ) : null}
      </div>
      {expandable ? (
        <OsHugSheet
          open={open}
          onClose={() => setOpen(false)}
          label={title?.trim() || 'Bio'}
          closeAriaLabel="Close bio"
          zIndex={SHEET_Z.list}
          chrome="plain"
          sizing="hug"
          initialDetent="full"
          panelClassName="os-sheet-cap-standard"
        >
          <div className="portfolio-bio portfolio-bio--full">
            <PortfolioBioBlocks text={full} headingAs="p" />
          </div>
        </OsHugSheet>
      ) : null}
    </>
  );
}
