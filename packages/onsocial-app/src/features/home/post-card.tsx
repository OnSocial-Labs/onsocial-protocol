'use client';

import Link from 'next/link';
import type { PostRow } from '@onsocial/sdk';
import { appPageHref } from '@/lib/app-links';
import {
  formatPostTimestamp,
  parsePostText,
  postKey,
  postTimestampIso,
} from '@/lib/post-display';
import { fallbackLabel } from '@/lib/profile-display';

interface PostCardProps {
  post: PostRow;
}

export function PostCard({ post }: PostCardProps) {
  const text = parsePostText(post.value);
  const label = fallbackLabel(post.accountId);
  const timestampIso = postTimestampIso(post.blockTimestamp);

  return (
    <article className="post-card animate-rise-in">
      <header className="post-card-header">
        <Link className="post-card-author" href={appPageHref(post.accountId)}>
          @{label}
        </Link>
        <time
          className="post-card-time"
          {...(timestampIso ? { dateTime: timestampIso } : {})}
        >
          {formatPostTimestamp(post.blockTimestamp)}
        </time>
      </header>
      <p className="post-card-body">{text || '…'}</p>
    </article>
  );
}

export { postKey };
