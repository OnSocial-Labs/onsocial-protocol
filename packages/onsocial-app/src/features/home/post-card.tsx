'use client';

import Link from 'next/link';
import type { PostRow } from '@onsocial/sdk';
import { appPageHref } from '@/lib/app-links';
import {
  formatPostTimestamp,
  parsePostText,
  postKey,
} from '@/lib/post-display';
import { fallbackLabel } from '@/lib/profile-display';

interface PostCardProps {
  post: PostRow;
}

export function PostCard({ post }: PostCardProps) {
  const text = parsePostText(post.value);
  const label = fallbackLabel(post.accountId);

  return (
    <article className="post-card animate-rise-in">
      <header className="post-card-header">
        <Link className="post-card-author" href={appPageHref(post.accountId)}>
          @{label}
        </Link>
        <time
          className="post-card-time"
          dateTime={new Date(post.blockTimestamp * 1000).toISOString()}
        >
          {formatPostTimestamp(post.blockTimestamp)}
        </time>
      </header>
      <p className="post-card-body">{text || '…'}</p>
    </article>
  );
}

export { postKey };
