'use client';

import { PortfolioAboutLink } from '@/components/portfolio/portfolio-about-link';
import { PortfolioBioBlocks } from '@/components/portfolio/portfolio-bio-blocks';
import { profileAboutBlocks } from '@/lib/profile-bio-rich';
import { profileBioFace } from '@/lib/profile-bio-face';

export function PortfolioFaceBio({
  accountId,
  text,
  showAbout,
}: {
  accountId: string;
  text: string;
  showAbout?: boolean;
}) {
  const faceText = profileBioFace(text);
  if (!faceText || profileAboutBlocks(faceText).length === 0) return null;

  return (
    <>
      <div className="portfolio-bio portfolio-bio--face">
        <PortfolioBioBlocks text={faceText} headingAs="p" />
      </div>
      {showAbout ? <PortfolioAboutLink accountId={accountId} /> : null}
    </>
  );
}
