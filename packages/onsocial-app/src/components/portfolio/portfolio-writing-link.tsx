'use client';

import Link from 'next/link';
import { writingArticlesAttr } from '@/lib/article-post-payload';
import { writingPath } from '@/lib/overlay-routes';

/** Presentational Writing door. Visibility is the server presence plus CSS. */
export function PortfolioWritingAnchor({ accountId }: { accountId: string }) {
  return (
    <Link
      href={writingPath(accountId)}
      className="portfolio-about-link portfolio-writing-entry"
      scroll={false}
    >
      Writing
    </Link>
  );
}

/**
 * Face / About entry. The anchor stays in the tree so the first paint matches
 * hydration. Visitors with no articles (or an unknown count) are hidden in CSS
 * before paint. The owner keeps the door.
 */
export function PortfolioWritingLink({
  accountId,
  articlePresence,
}: {
  accountId: string;
  articlePresence: boolean | null;
}) {
  return (
    <span
      className="portfolio-writing-slot"
      data-articles={writingArticlesAttr(articlePresence)}
    >
      <PortfolioWritingAnchor accountId={accountId} />
    </span>
  );
}
