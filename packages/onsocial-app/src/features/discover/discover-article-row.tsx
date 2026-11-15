'use client';

import type { MouseEvent } from 'react';
import Link from 'next/link';
import { HeartIcon } from '@onsocial/ui';
import { DiscoveryPartyStack } from '@/components/discovery/discovery-party-stack';
import { PortfolioWritingCover } from '@/components/portfolio/portfolio-writing-cover';
import type { DiscoverArticleCover } from '@/features/discover/use-discover-article-covers';
import { formatWritingLikeLabel } from '@/lib/article-post-payload';
import { StableCount } from '@/components/ui/stable-count';
import { writingArticlePath } from '@/lib/overlay-routes';
import {
  formatPostTimestamp,
  formatRelativePostTimestamp,
  postTimestampIso,
} from '@/lib/post-display';

/**
 * Essay row for Moving and the Articles list. The thumb is the cover.
 * Title|time on one band; byline + likes full width under the trail.
 * The row opens the essay — party chrome is not a nested link.
 */
export function DiscoverArticleRow({
  accountId,
  postId,
  title,
  profileName,
  avatarUrl,
  cover,
  blockTimestamp,
  likeCount = 0,
  onOpen,
}: {
  accountId: string;
  postId: string;
  title: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  cover?: DiscoverArticleCover | null;
  blockTimestamp?: number;
  likeCount?: number;
  onOpen?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const issuedAt = blockTimestamp ?? 0;
  const whenIso = issuedAt > 0 ? postTimestampIso(issuedAt) : undefined;
  const likeLabel = formatWritingLikeLabel(likeCount);
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
      <div className="drops-discovery-body">
        <div className="drops-discovery-top">
          <div className="market-listing-head drops-discovery-head">
            <span className="market-listing-title">{title}</span>
          </div>
          {whenIso ? (
            <div className="market-listing-action-col drops-discovery-action-col">
              <div className="drops-discovery-head-trail">
                <time
                  className="market-listing-meta-right"
                  dateTime={whenIso}
                  title={formatPostTimestamp(issuedAt)}
                >
                  {formatRelativePostTimestamp(issuedAt)}
                </time>
              </div>
            </div>
          ) : null}
        </div>
        <div className="drops-discovery-ledger">
          <div className="drops-discovery-stack">
            <DiscoveryPartyStack
              accountId={accountId}
              displayName={profileName}
              avatarUrl={avatarUrl}
              lead="by"
              link={false}
            />
            {likeLabel ? (
              <span className="discover-article-likes" aria-label={likeLabel}>
                <HeartIcon className="discover-article-likes-icon" aria-hidden />
                <StableCount value={likeCount} />
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}
