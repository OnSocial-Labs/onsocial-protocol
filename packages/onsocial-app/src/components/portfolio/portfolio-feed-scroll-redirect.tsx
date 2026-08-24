'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  PORTFOLIO_FEED_SECTION_ID,
  portfolioPath,
} from '@/lib/overlay-routes';
import { requestPortfolioFeedReveal } from '@/lib/portfolio-feed-reveal';

/** Soft `/feed` intercept — open the portfolio page drawer on the feed. */
export function PortfolioFeedScrollRedirect({
  accountId,
}: {
  accountId: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const search = window.location.search;
    // Hash covers the case where the portfolio shell is not mounted yet
    // (soft nav from a full-page panel); the reveal event covers the
    // already-mounted face. Whichever consumes the signal strips the hash.
    router.replace(
      `${portfolioPath(accountId)}${search}#${PORTFOLIO_FEED_SECTION_ID}`,
      { scroll: false }
    );
    requestPortfolioFeedReveal();
  }, [accountId, router]);

  return null;
}
