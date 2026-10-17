'use client';

import type { MouseEvent } from 'react';
import Link from 'next/link';
import { HeartIcon } from '@onsocial/ui';
import { PortfolioWritingCover } from '@/components/portfolio/portfolio-writing-cover';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { commercePartyLines } from '@/features/scarces/collection-creator-face';
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
 * Name and @id stack beside it, the same way a drop row does.
 * The time sits opposite the title. A quiet heart count is the validation.
 * The row opens the essay.
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
  const party = commercePartyLines(accountId, profileName);
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
      <div className="market-listing-copy drops-discovery-copy">
        <div className="market-listing-head">
          <span className="market-listing-title">{title}</span>
          {whenIso ? (
            <time
              className="market-listing-meta-right"
              dateTime={whenIso}
              title={formatPostTimestamp(issuedAt)}
            >
              {formatRelativePostTimestamp(issuedAt)}
            </time>
          ) : null}
        </div>
        <span className="drops-discovery-party drops-discovery-party--lead">
          <AccountAvatar
            accountId={accountId}
            src={avatarUrl}
            fallbackInitial={party.name.slice(0, 1)}
            size="sm"
            className="drops-discovery-party-avatar"
          />
          <span className="drops-discovery-party-stack">
            <span className="drops-discovery-lead">by</span>
            <span className="drops-discovery-by">{party.name}</span>
            <span className="drops-discovery-sub">@{party.handle}</span>
          </span>
        </span>
        {likeLabel ? (
          <span className="discover-article-likes" aria-label={likeLabel}>
            <HeartIcon className="discover-article-likes-icon" aria-hidden />
            <StableCount value={likeCount} />
          </span>
        ) : null}
      </div>
    </Link>
  );
}
