'use client';

import Link from 'next/link';
import {
  formatRelativePostTimestamp,
  postTimestampIso,
} from '@/lib/post-display';
import type {
  ProfilePostPeek,
  ProfileScarcePeek,
} from '@/lib/fetch-profile-peeks';
import { overlayPath } from '@/lib/overlay-routes';

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

  const feedHref = overlayPath(pageAccountId, 'feed');

  return (
    <ul className="page-drawer-post-peek">
      {posts.map((post) => {
        const href = feedHref;
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

export function PageDrawerScarcePeekRail({
  scarces,
}: {
  scarces: ProfileScarcePeek[];
}) {
  if (scarces.length === 0) {
    return null;
  }

  return (
    <div className="page-drawer-scarce-rail" aria-label="Scarces">
      {scarces.map((scarce) => (
        <article
          key={scarce.tokenId}
          className="page-drawer-scarce-card"
          title={scarce.tokenId}
        >
          <div
            className={`page-drawer-scarce-cover${scarce.mediaUrl ? ' has-media' : ''}`}
            aria-hidden
          >
            {scarce.mediaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={scarce.mediaUrl} alt="" />
            ) : null}
          </div>
          <span className="page-drawer-scarce-body">
            <span className="page-drawer-scarce-title">{scarce.title}</span>
            <span className="page-drawer-scarce-id">{scarce.tokenId}</span>
          </span>
        </article>
      ))}
    </div>
  );
}
