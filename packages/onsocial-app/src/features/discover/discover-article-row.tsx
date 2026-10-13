'use client';

import type { MouseEvent } from 'react';
import Link from 'next/link';
import { PortfolioWritingCover } from '@/components/portfolio/portfolio-writing-cover';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { discoverArticleByline } from '@/features/discover/discover-catalog';
import type { DiscoverArticleCover } from '@/features/discover/use-discover-article-covers';
import { writingArticlePath } from '@/lib/overlay-routes';
import { displayName } from '@/lib/profile-display';

/**
 * Essay row for Moving and the Articles list. The thumb is the cover.
 * The small face sits on the byline. The row opens the essay.
 */
export function DiscoverArticleRow({
  accountId,
  postId,
  title,
  profileName,
  avatarUrl,
  cover,
  onOpen,
}: {
  accountId: string;
  postId: string;
  title: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  cover?: DiscoverArticleCover | null;
  onOpen?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const name = displayName(accountId, profileName);
  return (
    <Link
      href={writingArticlePath(accountId, postId)}
      scroll={false}
      className="market-listing-row discover-catalog-row"
      aria-label={title}
      onClick={onOpen}
    >
      <span
        className={`market-listing-thumb drops-discovery-thumb${
          cover ? ' has-media' : ''
        }`}
      >
        {cover ? (
          <span className="portfolio-writing-cover discover-article-cover">
            <PortfolioWritingCover
              variant="list"
              title={title}
              coverUrl={cover.coverUrl}
              cardBg={cover.cardBg}
              format={cover.format}
              markShape={cover.markShape}
              markColor={cover.markColor}
              accountId={accountId}
              displayName={profileName}
              avatarUrl={avatarUrl}
              postId={postId}
              issuedAt={cover.issuedAt}
            />
          </span>
        ) : (
          <span className="market-listing-thumb-fallback" />
        )}
      </span>
      <div className="market-listing-copy">
        <span className="market-listing-title">{title}</span>
        <p className="drops-discovery-deal discover-article-byline">
          <AccountAvatar
            accountId={accountId}
            src={avatarUrl}
            fallbackInitial={name}
            size="sm"
          />
          <span className="drops-discovery-deal-bits">
            {discoverArticleByline(accountId, profileName)}
          </span>
        </p>
      </div>
    </Link>
  );
}
