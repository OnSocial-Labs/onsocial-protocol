'use client';

import Link from 'next/link';
import type { PostRow } from '@onsocial/sdk';
import { parseArticleSnapshot } from '@/lib/article-post-payload';
import { writingArticlePath } from '@/lib/overlay-routes';
import {
  parsePostText,
  postKey,
  truncatePostPreview,
} from '@/lib/post-display';
import {
  isRenderablePostVideo,
  parsePostMedia,
  postVisualMedia,
} from '@/lib/post-media';
import { postThreadPath } from '@/lib/post-routes';

const MEDIA_CAPTION_CHARS = 72;

/** One author-feed page while Media has no indexed column. */
export const PROFILE_MEDIA_PAGE_SIZE = 72;

/**
 * Next offset for the author feed. A short page is the end. A full page that
 * was already in the pool is also the end, so a repeated window cannot loop.
 */
export function profileMediaAdvance(opts: {
  offset: number;
  pageSize: number;
  itemCount: number;
  addedCount: number;
}): { offset: number; hasMore: boolean } {
  if (opts.itemCount < opts.pageSize || opts.addedCount <= 0) {
    return { offset: opts.offset, hasMore: false };
  }
  return { offset: opts.offset + opts.pageSize, hasMore: true };
}

export interface ProfileMediaCover {
  key: string;
  href: string;
  title: string;
  kind: 'Photo' | 'Video';
  coverUrl: string;
  count: number;
}

/** One scannable cover per post that has a photo or video. */
export function profileMediaCovers(
  posts: readonly PostRow[]
): ProfileMediaCover[] {
  const covers: ProfileMediaCover[] = [];
  for (const post of posts) {
    const visual = postVisualMedia(parsePostMedia(post.value));
    const first = visual[0];
    if (!first) continue;
    const video = isRenderablePostVideo(first);
    const kind = video ? 'Video' : 'Photo';
    const article = parseArticleSnapshot(post.value);
    const parsedText = parsePostText(post.value);
    const caption =
      parsedText && parsedText !== post.value.trim()
        ? truncatePostPreview(parsedText, MEDIA_CAPTION_CHARS)
        : '';
    covers.push({
      key: postKey(post),
      href: article
        ? writingArticlePath(post.accountId, post.postId)
        : postThreadPath(post),
      title: article?.title || caption || kind,
      kind,
      coverUrl: first.url,
      count: visual.length,
    });
  }
  return covers;
}

function CoverMedia({ cover }: { cover: ProfileMediaCover }) {
  if (cover.kind === 'Video') {
    return (
      <video
        src={cover.coverUrl}
        muted
        playsInline
        preload="metadata"
        aria-hidden
      />
    );
  }
  return <img src={cover.coverUrl} alt="" />;
}

/** Profile Media tab — cover cards. The link opens the post. */
export function PageDrawerMediaGrid({ posts }: { posts: readonly PostRow[] }) {
  const covers = profileMediaCovers(posts);
  if (covers.length === 0) return null;

  return (
    <div className="page-drawer-media-grid" aria-label="Media">
      {covers.map((cover) => {
        const countLabel = cover.count > 1 ? `, ${cover.count} items` : '';
        return (
          <Link
            key={cover.key}
            href={cover.href}
            scroll={false}
            className="page-drawer-media-card group"
            aria-label={`${cover.title}, ${cover.kind}${countLabel}`}
          >
            <span className="page-drawer-media-cover has-media" aria-hidden>
              <CoverMedia cover={cover} />
              {cover.kind === 'Video' ? (
                <span className="page-drawer-media-badge">Video</span>
              ) : null}
            </span>
            <span className="page-drawer-media-body">
              <span className="page-drawer-media-title">{cover.title}</span>
              <span className="page-drawer-media-meta">
                {cover.title === cover.kind ? null : (
                  <span className="page-drawer-media-kind">{cover.kind}</span>
                )}
                {cover.count > 1 ? (
                  <span className="page-drawer-media-editions">
                    ×{cover.count}
                  </span>
                ) : null}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/** Cover bones while the Media section fetch is in flight. */
export function PageDrawerMediaGridSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="page-drawer-media-grid" aria-hidden>
      {Array.from({ length: cards }, (_, index) => (
        <span key={index} className="page-drawer-media-card">
          <span className="page-drawer-media-cover standing-row-shimmer" />
        </span>
      ))}
    </div>
  );
}
