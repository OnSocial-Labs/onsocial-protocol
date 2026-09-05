'use client';

import Link from 'next/link';
import { useOverlayDismissIfMounted } from '@/contexts/overlay-dismiss-context';
import { aboutPath, portfolioFeedPath } from '@/lib/overlay-routes';
import { requestPortfolioFeedReveal } from '@/lib/portfolio-feed-reveal';

/** Quiet face door — only when the About room is set. */
export function PortfolioAboutLink({ accountId }: { accountId: string }) {
  return (
    <Link
      href={aboutPath(accountId)}
      className="portfolio-about-link"
      scroll={false}
    >
      About
    </Link>
  );
}

/** About closer — leaves the essay for Launch (drawer on the face). */
export function PortfolioAboutWorkLink({ accountId }: { accountId: string }) {
  const dismissOverlay = useOverlayDismissIfMounted();

  return (
    <Link
      href={portfolioFeedPath(accountId)}
      className="portfolio-about-link"
      scroll={false}
      onClick={(event) => {
        if (!dismissOverlay) return;
        event.preventDefault();
        dismissOverlay();
        requestPortfolioFeedReveal();
      }}
    >
      See work
    </Link>
  );
}
