'use client';

import Link from 'next/link';
import { writingPath } from '@/lib/overlay-routes';

/** Face / About entry to the Writing shelf. */
export function PortfolioWritingLink({ accountId }: { accountId: string }) {
  return (
    <Link
      href={writingPath(accountId)}
      className="portfolio-about-link"
      scroll={false}
    >
      Writing
    </Link>
  );
}
