'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { PortfolioAboutLink } from '@/components/portfolio/portfolio-about-link';
import { PostRichText } from '@/features/home/post-rich-text';
import { profileBioFace } from '@/lib/profile-bio-face';

export function PortfolioFaceBio({
  accountId,
  text,
  forceAbout,
}: {
  accountId: string;
  text: string;
  /** Tagline hiding a longer bio, or more than four stored lines. */
  forceAbout?: boolean;
}) {
  const faceText = profileBioFace(text);
  const bioRef = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(Boolean(forceAbout));

  useLayoutEffect(() => {
    if (forceAbout) {
      setOverflows(true);
      return;
    }
    const el = bioRef.current;
    if (!el) {
      setOverflows(false);
      return;
    }
    setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [faceText, forceAbout]);

  if (!faceText) return null;

  return (
    <>
      <p ref={bioRef} className="portfolio-bio portfolio-bio--face">
        <PostRichText text={faceText} emptyFallback="" showLinkIcon />
      </p>
      {overflows ? <PortfolioAboutLink accountId={accountId} /> : null}
    </>
  );
}
