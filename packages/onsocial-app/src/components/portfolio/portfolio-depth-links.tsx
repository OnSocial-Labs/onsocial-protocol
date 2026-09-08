'use client';

import { PortfolioAboutLink } from '@/components/portfolio/portfolio-about-link';
import {
  PortfolioWritingAnchor,
  useShowPortfolioWritingLink,
} from '@/components/portfolio/portfolio-writing-link';

/**
 * Face depth doors — one quiet line: About · Writing.
 * Matches Stand · Endorse · Support separator language.
 */
export function PortfolioDepthLinks({
  accountId,
  showAbout = false,
}: {
  accountId: string;
  showAbout?: boolean;
}) {
  const showWriting = useShowPortfolioWritingLink(accountId);

  if (!showAbout && !showWriting) return null;

  return (
    <nav className="portfolio-depth-links" aria-label="More">
      {showAbout ? <PortfolioAboutLink accountId={accountId} /> : null}
      {showAbout && showWriting ? (
        <span className="portfolio-depth-sep" aria-hidden>
          ·
        </span>
      ) : null}
      {showWriting ? <PortfolioWritingAnchor accountId={accountId} /> : null}
    </nav>
  );
}
