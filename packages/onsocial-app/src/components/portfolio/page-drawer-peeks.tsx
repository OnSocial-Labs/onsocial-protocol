'use client';

import Link from 'next/link';
import {
  formatRelativePostTimestamp,
  postTimestampIso,
} from '@/lib/post-display';
import type { ProfilePostPeek, ProfileCreatedPeek } from '@/lib/fetch-profile-peeks';
import type { PortfolioHoldingPeek } from '@/lib/portfolio-holdings';
import { personalPostPath } from '@/lib/post-routes';
import { APP_MARKET_PATH, marketCreatorPath } from '@/lib/app-routes';

export function PageDrawerPostPeekList({
  pageAccountId,
  posts,
}: {
  pageAccountId: string;
  posts: ProfilePostPeek[];
}) {
  if (posts.length === 0) {
    return null;
  }

  return (
    <ul className="page-drawer-post-peek">
      {posts.map((post) => {
        const href = personalPostPath(post.accountId || pageAccountId, post.postId);
        const relative = formatRelativePostTimestamp(post.blockTimestamp);
        const iso = postTimestampIso(post.blockTimestamp);
        return (
          <li key={`${post.accountId}:${post.postId}`}>
            <Link className="page-drawer-post-peek-card" href={href} scroll={false}>
              <span className="page-drawer-post-peek-text">{post.text}</span>
              <span className="page-drawer-post-peek-meta">
                {post.kind ? (
                  <span className="page-drawer-post-peek-kind">{post.kind}</span>
                ) : null}
                <time dateTime={iso} title={iso}>
                  {relative}
                </time>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Owner wallet holdings — deep-link into Read / Play / Show pass / etc. */
export function PageDrawerHoldingsRail({
  holdings,
}: {
  holdings: PortfolioHoldingPeek[];
}) {
  if (holdings.length === 0) {
    return null;
  }

  return (
    <div className="page-drawer-scarce-rail" aria-label="Your collectibles">
      {holdings.map((item) => (
        <Link
          key={item.tokenId}
          href={item.href}
          scroll={false}
          className="page-drawer-scarce-card"
          title={`${item.title} · ${item.actionLabel}`}
        >
          <div
            className={`page-drawer-scarce-cover${item.mediaUrl ? ' has-media' : ''}`}
            aria-hidden
          >
            {item.mediaUrl ? <img src={item.mediaUrl} alt="" /> : null}
          </div>
          <span className="page-drawer-scarce-body">
            <span className="page-drawer-scarce-title">{item.title}</span>
            <span className="page-drawer-scarce-meta">
              {item.kindLabel ? (
                <span className="page-drawer-scarce-kind">{item.kindLabel}</span>
              ) : null}
              <span className="page-drawer-scarce-action">{item.actionLabel}</span>
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

/** Public mint showcase — editions this account created. */
export function PageDrawerCreatedRail({
  created,
}: {
  created: ProfileCreatedPeek[];
}) {
  if (created.length === 0) {
    return null;
  }

  return (
    <div className="page-drawer-scarce-rail" aria-label="Created scarces">
      {created.map((item) => (
        <Link
          key={item.tokenId}
          href={item.href}
          scroll={false}
          className="page-drawer-scarce-card"
          title={item.title}
        >
          <div
            className={`page-drawer-scarce-cover${item.mediaUrl ? ' has-media' : ''}`}
            aria-hidden
          >
            {item.mediaUrl ? <img src={item.mediaUrl} alt="" /> : null}
          </div>
          <span className="page-drawer-scarce-body">
            <span className="page-drawer-scarce-title">{item.title}</span>
            <span className="page-drawer-scarce-meta">
              <span className="page-drawer-scarce-action">View</span>
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

export function PageDrawerCreatedSeeAll({
  pageAccountId,
}: {
  pageAccountId: string;
}) {
  return (
    <Link
      className="page-drawer-section-action"
      href={marketCreatorPath(pageAccountId)}
    >
      See in Market
    </Link>
  );
}

export function PageDrawerHoldingsSeeAll() {
  return (
    <Link className="page-drawer-section-action" href={APP_MARKET_PATH}>
      Manage in Market
    </Link>
  );
}
