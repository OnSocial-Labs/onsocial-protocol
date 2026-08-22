'use client';

import Link from 'next/link';
import { ProtocolMotionArrow } from '@onsocial/ui';
import {
  formatRelativePostTimestamp,
  postTimestampIso,
} from '@/lib/post-display';
import {
  type ProfileCreatedPeek,
  type ProfilePostPeek,
} from '@/lib/fetch-profile-peeks';
import {
  groupHoldingsForRail,
  type PortfolioHoldingPeek,
} from '@/lib/portfolio-holdings';
import { personalPostPath } from '@/lib/post-routes';
import { marketCreatorPath } from '@/lib/app-routes';
import { portfolioCollectiblesPath } from '@/lib/overlay-routes';
import { useViewerSafeMode } from '@/hooks/use-viewer-safe-mode';
import { safeModePeekText } from '@/lib/post-content-labels';
import { isPostVideoMime } from '@/lib/post-media';

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
        const gated = safeMode && (Boolean(post.nsfw) || Boolean(post.contentWarning));
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
        const thumb = gated ? null : (post.media ?? null);
        const pollOptions = post.pollOptions ?? [];
        const showVideoPlay =
          Boolean(thumb && isPostVideoMime(thumb.mime) && post.kind !== 'quote');
        return (
          <li key={`${post.accountId}:${post.postId}`}>
            <Link className="page-drawer-post-peek-card" href={href} scroll={false}>
              <span className="page-drawer-post-peek-main">
                <span className="page-drawer-post-peek-text">
                  {displayText || (thumb ? 'Media post' : '')}
                </span>
                {pollOptions.length > 0 ? (
                  <span className="page-drawer-post-peek-options" aria-hidden>
                    {pollOptions.map((option) => (
                      <span
                        key={option}
                        className="page-drawer-post-peek-option"
                      >
                        {option}
                      </span>
                    ))}
                  </span>
                ) : null}
                <span className="page-drawer-post-peek-meta">
                  {post.kind ? (
                    <span className="page-drawer-post-peek-kind">{post.kind}</span>
                  ) : null}
                  <time dateTime={iso} title={iso}>
                    {relative}
                  </time>
                </span>
              </span>
              {thumb ? (
                <span
                  className={`page-drawer-post-peek-thumb${
                    showVideoPlay ? ' is-video' : ''
                  }`}
                  aria-hidden
                >
                  {isPostVideoMime(thumb.mime) ? (
                    <video
                      src={thumb.url}
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img src={thumb.url} alt="" loading="lazy" decoding="async" />
                  )}
                  {showVideoPlay ? (
                    <span className="page-drawer-post-peek-play" />
                  ) : null}
                </span>
              ) : null}
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
    <div className="page-drawer-media-rail" aria-label="Collectibles">
      {groupHoldingsForRail(holdings).map((item) => (
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
              {item.editionCount > 1 ? (
                <span className="page-drawer-media-editions">
                  ×{item.editionCount}
                </span>
              ) : null}
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
      className="page-drawer-section-action group"
      href={marketCreatorPath(pageAccountId)}
      scroll={false}
    >
      See all in Market
      <ProtocolMotionArrow className="page-drawer-section-action-arrow" />
    </Link>
  );
}

export function PageDrawerHoldingsSeeAll({
  pageAccountId,
}: {
  pageAccountId: string;
}) {
  return (
    <Link
      className="page-drawer-section-action group"
      href={portfolioCollectiblesPath(pageAccountId)}
      scroll={false}
    >
      See all collectibles
      <ProtocolMotionArrow className="page-drawer-section-action-arrow" />
    </Link>
  );
}
