'use client';

import Link from 'next/link';
import { aboutPath } from '@/lib/overlay-routes';

/** Quiet face overflow — only when About has more than the four-line clamp. */
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
