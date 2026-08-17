'use client';

import Link from 'next/link';
import {
  formatRelativePostTimestamp,
  postTimestampIso,
} from '@/lib/post-display';
import type { ProfilePostPeek, ProfileCreatedPeek } from '@/lib/fetch-profile-peeks';
import type { PortfolioHoldingPeek } from '@/lib/portfolio-holdings';
import { personalPostPath } from '@/lib/post-routes';
import { APP_COLLECTIBLES_PATH, marketCreatorPath } from '@/lib/app-routes';
import { useViewerSafeMode } from '@/hooks/use-viewer-safe-mode';
import { safeModePeekText } from '@/lib/post-content-labels';

export function PageDrawerPostPeekList({
  pageAccountId,
  posts,
}: {
  pageAccountId: string;
  posts: ProfilePostPeek[];
}) {
  const { safeMode } = useViewerSafeMode();

  if (posts.length === 0) {
    return null;
  }

  return (
    <ul className="page-drawer-post-peek">
      {posts.map((post) => {
        const href = personalPostPath(post.accountId || pageAccountId, post.postId);
        const relative = formatRelativePostTimestamp(post.blockTimestamp);
        const iso = postTimestampIso(post.blockTimestamp);
        const displayText = safeModePeekText(
          post.text,
          {
            ...(post.contentWarning
              ? { contentWarning: post.contentWarning }
              : {}),
            ...(post.nsfw ? { nsfw: true } : {}),
          },
          safeMode
        );
        return (
          <li key={`${post.accountId}:${post.postId}`}>
            <Link className="page-drawer-post-peek-card" href={href} scroll={false}>
              <span className="page-drawer-post-peek-text">{displayText}</span>
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
    <div className="page-drawer-media-rail" aria-label="Your collectibles">
      {holdings.map((item) => (
        <Link
          key={item.tokenId}
          href={item.href}
          scroll={false}
          className="page-drawer-media-card group"
          title={`${item.title} · ${item.actionLabel}`}
        >
          <span
            className={`page-drawer-media-cover${item.mediaUrl ? ' has-media' : ''}`}
            aria-hidden
          >
            {item.mediaUrl ? <img src={item.mediaUrl} alt="" /> : null}
          </span>
          <span className="page-drawer-media-body">
            <span className="page-drawer-media-title">{item.title}</span>
            <span className="page-drawer-media-meta">
              {item.kindLabel ? (
                <span className="page-drawer-media-kind">{item.kindLabel}</span>
              ) : null}
              <span className="page-drawer-media-action">{item.actionLabel}</span>
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
    <div className="page-drawer-media-rail" aria-label="Created scarces">
      {created.map((item) => {
        const titleHint = item.kindLabel
          ? `${item.title} · ${item.kindLabel}`
          : item.title;
        return (
          <Link
            key={item.tokenId}
            href={item.href}
            scroll={false}
            className="page-drawer-media-card group"
            title={titleHint}
          >
            <span
              className={`page-drawer-media-cover${item.mediaUrl ? ' has-media' : ''}`}
              aria-hidden
            >
              {item.mediaUrl ? <img src={item.mediaUrl} alt="" /> : null}
            </span>
            <span className="page-drawer-media-body">
              <span className="page-drawer-media-title">{item.title}</span>
              <span className="page-drawer-media-meta">
                {item.kindLabel ? (
                  <span className="page-drawer-media-kind">{item.kindLabel}</span>
                ) : null}
                <span className="page-drawer-media-action">Open</span>
              </span>
            </span>
          </Link>
        );
      })}
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
      scroll={false}
    >
      See all in Market
    </Link>
  );
}

export function PageDrawerHoldingsSeeAll() {
  return (
    <Link
      className="page-drawer-section-action"
      href={APP_COLLECTIBLES_PATH}
      scroll={false}
    >
      See all collectibles
    </Link>
  );
}
