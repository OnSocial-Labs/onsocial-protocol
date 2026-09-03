'use client';

import { PortfolioAboutLink } from '@/components/portfolio/portfolio-about-link';
import { PostRichText } from '@/features/home/post-rich-text';
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
  if (!faceText) return null;

  return (
    <>
      <p className="portfolio-bio portfolio-bio--face">
        <PostRichText text={faceText} emptyFallback="" showLinkIcon />
      </p>
      {showAbout ? <PortfolioAboutLink accountId={accountId} /> : null}
    </>
  );
}
