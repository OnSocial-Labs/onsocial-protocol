'use client';

import { PortfolioAboutLink } from '@/components/portfolio/portfolio-about-link';
import { PortfolioWritingAnchor } from '@/components/portfolio/portfolio-writing-link';
import { writingArticlesAttr } from '@/lib/article-post-payload';

/** Face depth doors — one quiet line: About · Writing. */
export function PortfolioDepthLinks({
  accountId,
  showAbout = false,
  articlePresence,
}: {
  accountId: string;
  showAbout?: boolean;
  /** Server window. Null while the article read is unknown. */
  articlePresence: boolean | null;
}) {
  const articles = writingArticlesAttr(articlePresence);

  return (
    <nav
      className="portfolio-depth-links"
      data-articles={articles}
      aria-label="More"
    >
      {showAbout ? <PortfolioAboutLink accountId={accountId} /> : null}
      <span className="portfolio-writing-slot" data-articles={articles}>
        {showAbout ? <DepthSep /> : null}
        <PortfolioWritingAnchor accountId={accountId} />
      </span>
    </nav>
  );
}

function DepthSep() {
  return (
    <span className="portfolio-depth-sep" aria-hidden>
      ·
    </span>
  );
}
